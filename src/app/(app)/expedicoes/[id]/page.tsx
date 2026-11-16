import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Kpi, Tip } from "@/components/ui";
import { expEnd, expStatus, PRODUCTS, STAGES, stageOf, type Product, type Tone } from "@/lib/commission";
import type { ManualStage, StageId } from "@/lib/types";
import type { ClientLine } from "@/lib/ledger";
import { calculatedCashback, dealNo, RULE_TIP, sortPassengers, type Resolved } from "@/lib/matching";
import { cityLabel } from "@/lib/cities";
import { loadWorld, requireSession } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { brl, dm, fmtDate, plural } from "@/lib/format";
import { airportLabel } from "@/components/AirportOptions";
import { ClientTools, DealActions, NewDealForm, ReviewToggle } from "./forms";
import { ClientsTable, type TableRow } from "./ClientsTable";
import { CashbackEditor } from "./CashbackEditor";
import type { ProductDeal } from "./ProductCell";

export const metadata = { title: "Expedição" };

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
  const lines: ClientLine[] = t.clients.map((c) => ledger.clientLine(c));
  const notesOf = (dealId: string) => world.notes.filter((n) => n.deal_id === dealId);
  let vayUsers: { id: string; name: string }[] = [];
  if (isVay) {
    const { data } = await (await createClient()).from("profiles").select("id, full_name, email").eq("role", "vay").order("full_name");
    vayUsers = (data ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email }));
  }
  const pd = (r: Resolved): ProductDeal => ({
    id: r.deal.id,
    no: dealNo(r.deal),
    value: null,
    details: r.deal.details ?? {},
    notes: notesOf(r.deal.id),
  });
  // Produtos de uma linha: valor só nos negócios da linha principal; nas outras, "Incluído no #…".
  const prods = (primary: Resolved[], included: Resolved[], hasDeal: boolean): TableRow["prods"] =>
    PRODUCTS.map((k: Product) => ({
      product: k,
      primary: primary.filter((r) => Number(r.deal[k]) > 0).map((r) => ({ ...pd(r), value: Number(r.deal[k]) })),
      included: included.filter((r) => Number(r.deal[k]) > 0).map((r) => pd(r)),
      hasDeal,
    }));
  const stageCell = (id: StageId, manual: ManualStage, editable: boolean): TableRow["stage"] => {
    const sg = stageOf(id);
    return { id, label: sg.label, tone: sg.tone, editable: editable && (STAGES.find((x) => x.id === id)?.manual || id === "novo"), manual };
  };
  const fechado = stageOf("fechado");
  const noOwner = { id: null, name: "", editable: false };
  const commentsOf = (clientId: string) => world.comments.filter((c) => c.client_id === clientId);
  const tableRows: TableRow[] = [];
  for (const l of lines) {
    const c = l.client;
    tableRows.push({
      key: c.id,
      clientId: c.id,
      warn: false,
      people: [{ name: c.name, contact: c.email }],
      hiddenTxt:
        !isVay && l.hiddenPassengers
          ? `+${l.hiddenPassengers} ${l.hiddenPassengers === 1 ? "passageiro não cadastrado" : "passageiros não cadastrados"}`
          : undefined,
      stage: stageCell(l.stage, c.stage, isVay),
      owner: { id: c.owner_id, name: c.owner_name, editable: isVay },
      dealNos: l.deals.map((r) => dealNo(r.deal)),
      prods: prods(l.primary, l.included, l.deals.length > 0),
      com: l.primary.length ? l.com.total : l.included.length ? null : 0,
      hsNote: c.hs_note,
      comments: commentsOf(c.id),
      email: c.email,
      phone: c.phone,
    });
    if (isVay)
      for (const { passenger: p, deal: r } of l.unregistered)
        tableRows.push({
          key: `${c.id}-${p.id}`,
          clientId: null,
          warn: false,
          people: [{ name: p.name, contact: p.email }],
          tag: { label: "Não cadastrado pelo parceiro", tone: "neutral" },
          stage: { id: "fechado", label: fechado.label, tone: fechado.tone, editable: false, manual: "auto" },
          owner: noOwner,
          link: { passengers: [{ id: p.id, name: p.name }] },
          dealNos: [dealNo(r.deal)],
          prods: prods([], [r], true),
          com: null,
          hsNote: "",
          comments: [],
          email: p.email,
          phone: p.phone,
        });
  }
  if (isVay)
    for (const r of outside) {
      const ps = sortPassengers(r.deal.passengers);
      tableRows.push({
        key: r.deal.id,
        clientId: null,
        warn: true,
        people: ps.map((p) => ({ name: p.name, suffix: p.is_titular && ps.length > 1 ? " · titular" : undefined, contact: p.email })),
        tag: { label: "Fora da lista do parceiro", tone: "yellow" },
        link: { passengers: ps.map((p) => ({ id: p.id, name: p.name })) },
        stage: { id: "fechado", label: fechado.label, tone: fechado.tone, editable: false, manual: "auto" },
        owner: noOwner,
        dealNos: [dealNo(r.deal)],
        prods: prods([r], [], true),
        com: r.com.total,
        hsNote: "",
        comments: [],
        email: ps.map((p) => p.email).filter(Boolean).join(", "),
        phone: ps.map((p) => p.phone).filter(Boolean).join(", "),
      });
    }

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
          {isVay && partner ? (
            <Link href={`/parceiros/${partner.id}`} className="back">← Painel de {partner.name}</Link>
          ) : (
            <Link href="/expedicoes" className="back">← Expedições</Link>
          )}
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

      <section className="card">
        <div className="card-head">
          <div className="ttl">
            <h2 className="section-title">Clientes da expedição</h2>
            <Tip>
              {isVay
                ? "Clientes cadastrados pelo parceiro + negócios do HubSpot vinculados a esta expedição. Etapa e responsável se editam na própria linha; clique na observação para ver e adicionar comentários."
                : "Clientes que você cadastrou. Compras confirmadas pela Vay Agora aparecem aqui automaticamente. Clique na observação para ver os comentários."}
            </Tip>
          </div>
        </div>
        <ClientsTable
          rows={tableRows}
          isVay={isVay}
          earnHeader={isVay ? "Comissão" : "Seu ganho"}
          stageOptions={STAGES.map((x) => ({ value: x.id, label: x.label }))}
          manualStageOptions={[{ value: "auto", label: "Não contactado" }, ...STAGES.filter((x) => x.manual).map((x) => ({ value: x.id, label: x.label }))]}
          vayUsers={vayUsers.map((u) => ({ value: u.id, label: u.name }))}
          expName={exp.name}
          emptyText={isVay ? "O parceiro ainda não cadastrou clientes nesta expedição." : "Nenhum cliente cadastrado. Use “Cadastrar cliente” ou “Importar planilha”."}
          initialClient={sp.cliente}
          linkClients={t.clients.map((c) => ({ value: c.id, label: c.name })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))}
        />
        {!isVay && outside.length ? (
          <p className="small muted" style={{ padding: "12px 18px", borderTop: "1px solid var(--border-subtle)" }}>
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
