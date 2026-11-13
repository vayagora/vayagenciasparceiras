import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Kpi, Tip } from "@/components/ui";
import { expEnd, expStatus, PRODUCTS, stageOf, type Product, type Tone } from "@/lib/commission";
import type { ClientLine } from "@/lib/ledger";
import { calculatedCashback, dealNo, RULE_TIP, sortPassengers, type Resolved } from "@/lib/matching";
import { cityLabel } from "@/lib/cities";
import { loadWorld, requireSession } from "@/lib/data";
import { brl, dm, fmtDate, plural } from "@/lib/format";
import { airportLabel } from "@/components/AirportOptions";
import { ClientTools, DealActions, FollowUpForm, NewDealForm, ReviewToggle } from "./forms";
import { CashbackEditor } from "./CashbackEditor";
import { ProductCell, type ProductDeal } from "./ProductCell";

export const metadata = { title: "Expedição" };

function DealNos({ deals }: { deals: Resolved[] }) {
  return <td>{deals.length ? deals.map((r) => dealNo(r.deal)).join(", ") : "—"}</td>;
}

export default async function ExpeditionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ novo?: string; cliente?: string }>;
}) {
  const s = await requireSession();
  const [{ id }, sp, world] = await Promise.all([params, searchParams, loadWorld()]);
  const exp = world.exps.find((e) => e.id === id);
  if (!exp) notFound();

  const { ledger } = world;
  const isVay = s.isVay;
  const partner = world.partners.find((p) => p.id === exp.partner_id);
  const t = ledger.expStats(exp);
  const st = expStatus(exp);
  const outside = ledger.dealsForExp(exp.id).filter((r) => r.flags.some((f) => f.key === "fora"));
  const outsideCom = outside.reduce((a, r) => a + r.com.total, 0);
  const editing = isVay && sp.cliente ? t.clients.find((c) => c.id === sp.cliente) : undefined;
  const lines: ClientLine[] = t.clients.map((c) => ledger.clientLine(c));
  const notesOf = (dealId: string) => world.notes.filter((n) => n.deal_id === dealId);
  const pd = (r: Resolved): ProductDeal => ({
    id: r.deal.id,
    no: dealNo(r.deal),
    value: null,
    details: r.deal.details ?? {},
    notes: notesOf(r.deal.id),
  });
  // Células de produto: valor só nos negócios da linha principal; nas outras, "Incluído no #…".
  const cells = (primary: Resolved[], included: Resolved[], hasDeal: boolean) =>
    PRODUCTS.map((k: Product) => (
      <ProductCell
        key={k}
        product={k}
        primary={primary.filter((r) => Number(r.deal[k]) > 0).map((r) => ({ ...pd(r), value: Number(r.deal[k]) }))}
        included={included.filter((r) => Number(r.deal[k]) > 0).map((r) => pd(r))}
        hasDeal={hasDeal}
        canEdit={isVay}
      />
    ));

  const expDeals = ledger.resolved
    .filter((r) => r.deal.signaled !== false)
    .filter((r) => (r.exp && r.exp.id === exp.id) || (!r.exp && r.partner?.id === exp.partner_id))
    .sort(
      (a, b) =>
        Number(b.needsReview) - Number(a.needsReview) || (a.deal.closed_on < b.deal.closed_on ? 1 : -1),
    );
  const pending = ledger.pendingFor(exp);
  const unsignaled = isVay ? ledger.unsignaledFor(exp) : [];
  const portal = process.env.HUBSPOT_PORTAL_ID ?? "44656712";
  const partnerExps = world.exps.filter((e) => e.partner_id === exp.partner_id);
  const assignOptions = [
    { value: "auto", label: "Atribuição automática" },
    ...partnerExps.map((e) => ({ value: e.id, label: `${e.name} · ${cityLabel(e.city)} · ${fmtDate(e.start_date)}` })),
    { value: "none", label: "Sem expedição (não remunera)" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/expedicoes" className="back">← Todas as expedições</Link>
          <div className="row" style={{ gap: 8 }}>
            <Badge tone={st.tone} dot>{st.label}</Badge>
            {isVay && partner ? <Link href={`/parceiros/${partner.id}`}><Badge tone="neutral">{partner.name}</Badge></Link> : null}
          </div>
          <h1 className="page-title">{exp.name}</h1>
          <div className="meta">
            <span>Destino: <strong>{cityLabel(exp.city)}</strong></span>
            <span>Início: <strong>{fmtDate(exp.start_date)}</strong></span>
            <span>Fim: <strong>{fmtDate(expEnd(exp))}</strong></span>
            {exp.arrival_airport ? <span>Chegada: <strong>{airportLabel(exp.arrival_airport)}</strong></span> : null}
            {exp.departure_airport ? <span>Saída: <strong>{airportLabel(exp.departure_airport)}</strong></span> : null}
          </div>
        </div>
      </div>

      <div className="grid-kpi">
        <Kpi
          label="Clientes cadastrados"
          value={String(t.n)}
          sub={<span className="highlight">{plural(t.closed, "compra concluída", "compras concluídas")}</span>}
        />
        <Kpi accent label={isVay ? "Comissão do parceiro" : "Seus ganhos nesta expedição"} value={brl(t.total)} sub={`Voos ${brl(t.voo)} · Hosp. ${brl(t.hotel)} · Seg. ${brl(t.seguro)}`} />
        <Kpi label="Em negociação" value={String(t.stages.negociacao ?? 0)} sub={`${t.stages.novo ?? 0} não contactados`} />
      </div>

      {!isVay ? <ClientTools expId={exp.id} startOpen={!!sp.novo} /> : null}

      {editing ? (
        <FollowUpForm
          key={editing.id}
          expId={exp.id}
          client={{
            id: editing.id,
            name: editing.name,
            contact: [editing.email, editing.phone].filter(Boolean).join(" · "),
            stage: editing.stage,
            shown: stageOf(ledger.shownStage(editing)).label,
            note: editing.note,
          }}
        />
      ) : null}

      <section className="card">
        <div className="card-head">
          <div className="ttl">
            <h2 className="section-title">Clientes da expedição</h2>
            <Tip>
              {isVay
                ? "Clientes cadastrados pelo parceiro + negócios do HubSpot vinculados a esta expedição."
                : "Clientes que você cadastrou. Compras confirmadas pela Vay Agora aparecem aqui automaticamente."}
            </Tip>
          </div>
        </div>
        <div className="table-wrap">
          <table className="tbl" style={{ minWidth: isVay ? 1260 : 1120 }}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Etapa</th>
                <th>Negócio</th>
                <th>Voo</th>
                <th>Hospedagem</th>
                <th>Seguro</th>
                <th className="num">{isVay ? "Comissão" : "Seu ganho"}</th>
                <th>Observação</th>
                {isVay ? <th>Ação</th> : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const c = l.client;
                const sg = stageOf(l.stage);
                return [
                  <tr key={c.id} className={editing?.id === c.id ? "hl" : undefined}>
                    <td>
                      <span className="strong">{c.name}</span>
                      <div className="sub">{c.email || "—"}</div>
                      {c.phone ? <div className="sub">{c.phone}</div> : null}
                      {!isVay && l.hiddenPassengers ? (
                        <div className="sub">
                          +{l.hiddenPassengers} {l.hiddenPassengers === 1 ? "passageiro não cadastrado" : "passageiros não cadastrados"}
                        </div>
                      ) : null}
                      {isVay && c.hubspot_status ? (
                        <div style={{ marginTop: 6 }}>
                          <Badge tone={c.hubspot_status === "existente" ? "bluebell" : "neutral"}>
                            {c.hubspot_status === "existente" ? "Já existia no HubSpot" : "Novo no HubSpot"}
                          </Badge>
                        </div>
                      ) : null}
                    </td>
                    <td><Badge tone={sg.tone} dot>{sg.label}</Badge></td>
                    <DealNos deals={l.deals} />
                    {cells(l.primary, l.included, l.deals.length > 0)}
                    <td className="num strong">{l.primary.length ? brl(l.com.total) : l.included.length ? "—" : brl(0)}</td>
                    <td>
                      {c.partner_note ? <div style={{ maxWidth: 280, whiteSpace: "pre-wrap" }}>{c.partner_note}</div> : <span className="muted">—</span>}
                      {isVay && c.note ? <div className="sub" style={{ maxWidth: 280 }}>Nota interna: {c.note}</div> : null}
                    </td>
                    {isVay ? (
                      <td><Link href={`/expedicoes/${exp.id}?cliente=${c.id}#follow-up`} className="btn secondary sm">Atualizar</Link></td>
                    ) : null}
                  </tr>,
                  ...(isVay
                    ? l.unregistered.map(({ passenger: p, deal: r }) => (
                        <tr key={`${c.id}-${p.id}`}>
                          <td>
                            <span className="strong">{p.name}</span>
                            <div className="sub">{p.email || p.phone || "—"}</div>
                            <div style={{ marginTop: 6 }}><Badge tone="neutral">Não cadastrado pelo parceiro</Badge></div>
                          </td>
                          <td><Badge tone="purple" dot>{stageOf("fechado").label}</Badge></td>
                          <DealNos deals={[r]} />
                          {cells([], [r], true)}
                          <td className="num">—</td>
                          <td>—</td>
                          <td />
                        </tr>
                      ))
                    : []),
                ];
              })}
              {isVay
                ? outside.map((r) => {
                    const ps = sortPassengers(r.deal.passengers);
                    return (
                      <tr key={r.deal.id} className="warn">
                        <td>
                          {ps.map((p) => (
                            <div key={p.id}>
                              <span className={p.is_titular ? "strong" : undefined}>{p.name}</span>
                              {p.is_titular && ps.length > 1 ? <span className="sub"> · titular</span> : null}
                              <div className="sub">{p.email || p.phone}</div>
                            </div>
                          ))}
                          <div style={{ marginTop: 6 }}><Badge tone="yellow">Fora da lista do parceiro</Badge></div>
                        </td>
                        <td><Badge tone="purple" dot>{stageOf("fechado").label}</Badge></td>
                        <DealNos deals={[r]} />
                        {cells([r], [], true)}
                        <td className="num strong">{brl(r.com.total)}</td>
                        <td>Fechado em {fmtDate(r.deal.closed_on)}<div className="sub">Negócio marcado com o afiliado no HubSpot.</div></td>
                        <td />
                      </tr>
                    );
                  })
                : null}
              {t.clients.length === 0 && (!isVay || outside.length === 0) ? (
                <tr>
                  <td colSpan={isVay ? 9 : 8} className="empty">
                    {isVay
                      ? "O parceiro ainda não cadastrou clientes nesta expedição."
                      : "Nenhum cliente cadastrado. Use “Cadastrar cliente” ou “Importar planilha”."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {!isVay && outside.length ? (
          <p className="small muted" style={{ padding: "14px 24px", borderTop: "1px solid var(--border-subtle)" }}>
            Inclui {outside.length} {outside.length === 1 ? "venda atribuída" : "vendas atribuídas"} pela Vay Agora a esta expedição para clientes que não estão na sua lista · seu ganho: {brl(outsideCom)}.
          </p>
        ) : null}
      </section>

      {isVay ? (
        <section className="card pad stack" id="negocios">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="ttl">
              <h2 className="section-title">Negócios do HubSpot</h2>
              <Tip>{RULE_TIP}</Tip>
              {pending ? <Badge tone="yellow">{pending} para conferir</Badge> : null}
            </div>
            {partner ? <NewDealForm afiliado={partner.afiliado} defaultCity={exp.city} defaultDate={exp.start_date} /> : null}
          </div>
          {expDeals.length === 0 ? <p className="muted">Nenhum negócio do HubSpot vinculado a esta expedição ainda.</p> : null}
          {expDeals.map((r) => {
            const d = r.deal;
            const flags: { label: string; tone: Tone }[] = r.flags.map((f) => ({ label: f.label, tone: f.tone }));
            if (r.manual) flags.unshift({ label: "Ajuste manual", tone: "purple" });
            if (d.reviewed) flags.unshift({ label: "Conferido", tone: "success" });
            if (!flags.length) flags.push({ label: "Vínculo exato", tone: "success" });
            const prods = PRODUCTS.filter((k) => d[k] > 0).map((k) => `${k === "voo" ? "Voo" : k === "hotel" ? "Hospedagem" : "Seguro"} ${brl(d[k])}`);
            const others = r.candIds.slice(1).map((cid) => world.exps.find((e) => e.id === cid)?.name).filter(Boolean);
            return (
              <div key={d.id} className={`deal${r.needsReview ? " review" : ""}`}>
                <div className="top">
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="strong">Negócio {dealNo(d)}</span>
                      {flags.map((f, i) => <Badge key={i} tone={f.tone}>{f.label}</Badge>)}
                    </div>
                    <span className="small">
                      {sortPassengers(d.passengers).map((p, i) => {
                        const notListed = r.exp && r.unregistered.some((u) => u.id === p.id);
                        return (
                          <span key={p.id}>
                            {i ? " · " : ""}
                            <span className={p.is_titular ? "strong" : undefined}>{p.name}</span>
                            {p.is_titular ? " (titular)" : ""}
                            {notListed ? <span className="muted"> · não cadastrado</span> : null}
                          </span>
                        );
                      })}
                    </span>
                    <span className="small">
                      {d.legs.map((l) => `${l.city} ${dm(l.date)}`).join(" → ")} · volta {fmtDate(d.end_date)}
                    </span>
                    <span className="small muted">Fechado em {fmtDate(d.closed_on)} · {prods.join(" · ")}</span>
                    <span className="small muted">Pagamento: {d.payment_methods.length ? d.payment_methods.join(" + ") : "não informado no HubSpot"}</span>
                    <span className="small muted">
                      {r.reason}
                      {others.length ? ` Outras expedições compatíveis: ${others.join(", ")}.` : ""}
                    </span>
                  </div>
                  <div className="com">
                    <strong>{brl(r.com.total)}</strong>
                    <span className="small muted">{r.exp ? (r.flags.some((f) => f.key === "misto") ? "Cashback a definir" : "Cashback do parceiro") : "Sem expedição · não remunera"}</span>
                  </div>
                </div>
                <DealActions
                  dealId={d.id}
                  hereExpId={exp.id}
                  value={d.override_none ? "none" : d.override_expedition_id ?? "auto"}
                  options={assignOptions}
                  canLinkHere={!r.exp}
                  canReview={r.needsReview}
                  reviewed={d.reviewed}
                />
                {r.exp ? (
                  <div className="row">
                    <CashbackEditor
                      dealId={d.id}
                      dealNo={dealNo(d)}
                      current={r.com.total}
                      calculated={calculatedCashback(d)}
                      override={d.cashback_override}
                      history={world.cashbackHistory.filter((h) => h.deal_id === d.id)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      {isVay && unsignaled.length ? (
        <section className="card pad stack" id="nao-sinalizados" style={{ borderColor: "var(--red-300)" }}>
          <div className="ttl">
            <h2 className="section-title">Encontrados, mas não sinalizados no HubSpot</h2>
            <Tip>
              Negócios fechados com destino e datas compatíveis com esta expedição, mas sem a marcação de agência
              parceira no HubSpot. Não geram comissão até serem corrigidos lá; na próxima sincronização eles passam
              para a lista acima. Só a equipe Vay Agora vê esta seção.
            </Tip>
            <Badge tone="red">{unsignaled.length}</Badge>
          </div>
          {unsignaled.map((r) => {
            const d = r.deal;
            const prods = PRODUCTS.filter((k) => d[k] > 0).map((k) => `${k === "voo" ? "Voo" : k === "hotel" ? "Hospedagem" : "Seguro"} ${brl(d[k])}`);
            return (
              <div key={d.id} className={`deal${r.needsReview ? " review" : ""}`}>
                <div className="top">
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="strong">Negócio {dealNo(d)}</span>
                      {r.listEvidence ? (
                        <Badge tone="yellow">Passageiro na lista do parceiro</Badge>
                      ) : (
                        <Badge tone="neutral">Só destino e data</Badge>
                      )}
                      {d.reviewed ? <Badge tone="success">Conferido</Badge> : null}
                    </div>
                    {d.name ? <span className="small">{d.name}</span> : null}
                    <span className="small">{sortPassengers(d.passengers).map((p) => p.name).join(" · ") || "Sem contatos associados"}</span>
                    <span className="small">
                      {d.legs.map((l) => `${l.city} ${dm(l.date)}`).join(" → ")} · volta {fmtDate(d.end_date)}
                    </span>
                    <span className="small muted">Fechado em {fmtDate(d.closed_on)} · {prods.join(" · ")}</span>
                    <span className="small muted">{r.reason}</span>
                    <span className="small">
                      <strong>Para corrigir no HubSpot:</strong> {r.fixes.join("; ")}.{" "}
                      {d.hubspot_id ? (
                        <a href={`https://app.hubspot.com/contacts/${portal}/record/0-3/${d.hubspot_id}`} target="_blank" rel="noreferrer">
                          Abrir no HubSpot
                        </a>
                      ) : null}
                    </span>
                  </div>
                  <div className="com">
                    <strong>{brl(r.potential.total)}</strong>
                    <span className="small muted">Comissão se for sinalizado</span>
                  </div>
                </div>
                <ReviewToggle dealId={d.id} reviewed={d.reviewed} />
              </div>
            );
          })}
        </section>
      ) : null}
    </>
  );
}
