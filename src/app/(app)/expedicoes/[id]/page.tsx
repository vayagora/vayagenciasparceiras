import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Kpi, Tip } from "@/components/ui";
import { expEnd, expStatus, PRODUCTS, RULE_TIP, stageOf, type Resolved, type Tone } from "@/lib/commission";
import { cityLabel } from "@/lib/cities";
import { loadWorld, requireSession } from "@/lib/data";
import { brl, dm, fmtDate, plural } from "@/lib/format";
import { ClientTools, DealActions, FollowUpForm, NewDealForm } from "./forms";

export const metadata = { title: "Expedição" };

function prodCells(dl: Resolved[]) {
  return PRODUCTS.map((k) => {
    const v = dl.reduce((a, r) => a + (Number(r.deal[k]) || 0), 0);
    return v > 0
      ? { k, label: "Comprado", tone: "success" as Tone, value: brl(v) }
      : { k, label: dl.length ? "Não comprou" : "Sem compra", tone: "neutral" as Tone, value: "—" };
  });
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

  const expDeals = ledger.resolved
    .filter((r) => (r.exp && r.exp.id === exp.id) || (!r.exp && r.partner?.id === exp.partner_id))
    .sort(
      (a, b) =>
        Number(b.needsReview) - Number(a.needsReview) || (a.deal.closed_on < b.deal.closed_on ? 1 : -1),
    );
  const pending = ledger.pendingFor(exp);
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
            <span>Duração: <strong>{exp.days} dias</strong></span>
            <span>Término: <strong>{fmtDate(expEnd(exp))}</strong></span>
          </div>
        </div>
      </div>

      <div className="grid-kpi">
        <Kpi accent label={isVay ? "Comissão do parceiro" : "Seus ganhos nesta expedição"} value={brl(t.total)} sub={`Voos ${brl(t.voo)} · Hosp. ${brl(t.hotel)} · Seg. ${brl(t.seguro)}`} />
        <Kpi label="Volume vendido" value={brl(t.sold)} sub={plural(t.deals, "negócio fechado", "negócios fechados")} />
        <Kpi label="Clientes cadastrados" value={String(t.n)} sub={`${t.closed} com compra concluída`} />
        <Kpi label="Em negociação" value={String((t.stages.contato ?? 0) + (t.stages.proposta ?? 0))} sub={`${t.stages.novo ?? 0} aguardando contato`} />
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
          <table className="tbl" style={{ minWidth: isVay ? 1180 : 1040 }}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Etapa</th>
                <th>Voo</th>
                <th>Hospedagem</th>
                <th>Seguro</th>
                <th className="num">{isVay ? "Comissão" : "Seu ganho"}</th>
                <th>Último follow-up</th>
                {isVay ? <th>Ação</th> : null}
              </tr>
            </thead>
            <tbody>
              {t.clients.map((c) => {
                const sg = stageOf(ledger.shownStage(c));
                const cd = ledger.clientDeals(c);
                const com = cd.reduce((a, r) => a + r.com.total, 0);
                return (
                  <tr key={c.id} className={editing?.id === c.id ? "hl" : undefined}>
                    <td>
                      <span className="strong">{c.name}</span>
                      <div className="sub">{c.email || "—"}</div>
                      {c.phone ? <div className="sub">{c.phone}</div> : null}
                      {isVay && c.hubspot_status ? (
                        <div style={{ marginTop: 6 }}>
                          <Badge tone={c.hubspot_status === "existente" ? "bluebell" : "neutral"}>
                            {c.hubspot_status === "existente" ? "Já existia no HubSpot" : "Novo no HubSpot"}
                          </Badge>
                        </div>
                      ) : null}
                    </td>
                    <td><Badge tone={sg.tone} dot>{sg.label}</Badge></td>
                    {prodCells(cd).map((p) => (
                      <td key={p.k}><Badge tone={p.tone}>{p.label}</Badge><div className="sub">{p.value}</div></td>
                    ))}
                    <td className="num strong">{brl(com)}</td>
                    <td>
                      {c.last_follow_up ? fmtDate(c.last_follow_up) : "Sem contato"}
                      {c.note ? <div className="sub" style={{ maxWidth: 260 }}>{c.note}</div> : null}
                    </td>
                    {isVay ? (
                      <td><Link href={`/expedicoes/${exp.id}?cliente=${c.id}#follow-up`} className="btn secondary sm">Atualizar</Link></td>
                    ) : null}
                  </tr>
                );
              })}
              {isVay
                ? outside.map((r) => (
                    <tr key={r.deal.id} className="warn">
                      <td>
                        <span className="strong">{r.deal.contact_name}</span>
                        <div className="sub">{r.deal.email}</div>
                        <div style={{ marginTop: 6 }}><Badge tone="yellow">Fora da lista do parceiro</Badge></div>
                      </td>
                      <td><Badge tone="purple" dot>{stageOf("fechado").label}</Badge></td>
                      {prodCells([r]).map((p) => (
                        <td key={p.k}><Badge tone={p.tone}>{p.label}</Badge><div className="sub">{p.value}</div></td>
                      ))}
                      <td className="num strong">{brl(r.com.total)}</td>
                      <td>Fechado em {fmtDate(r.deal.closed_on)}<div className="sub">Negócio marcado com o afiliado no HubSpot.</div></td>
                      <td />
                    </tr>
                  ))
                : null}
              {t.clients.length === 0 && (!isVay || outside.length === 0) ? (
                <tr>
                  <td colSpan={isVay ? 8 : 7} className="empty">
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
                      <span className="strong">{d.contact_name}</span>
                      {flags.map((f, i) => <Badge key={i} tone={f.tone}>{f.label}</Badge>)}
                    </div>
                    <span className="small">
                      {d.legs.map((l) => `${l.city} ${dm(l.date)}`).join(" → ")} · volta {fmtDate(d.end_date)}
                    </span>
                    <span className="small muted">Fechado em {fmtDate(d.closed_on)} · {prods.join(" · ")}</span>
                    <span className="small muted">
                      {r.reason}
                      {others.length ? ` Outras expedições compatíveis: ${others.join(", ")}.` : ""}
                    </span>
                  </div>
                  <div className="com">
                    <strong>{brl(r.com.total)}</strong>
                    <span className="small muted">{r.exp ? "Comissão do parceiro" : "Sem expedição · não remunera"}</span>
                  </div>
                </div>
                <DealActions
                  dealId={d.id}
                  hereExpId={exp.id}
                  value={d.override_none ? "none" : d.override_expedition_id ?? "auto"}
                  options={assignOptions}
                  canLinkHere={!r.exp}
                  canReview={r.flags.length > 0 && !d.reviewed}
                  reviewed={d.reviewed}
                />
              </div>
            );
          })}
        </section>
      ) : null}
    </>
  );
}
