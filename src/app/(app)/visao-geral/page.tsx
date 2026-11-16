import Link from "next/link";
import { Badge, Kpi, Tip } from "@/components/ui";
import { addMoney, isDone, ZERO } from "@/lib/commission";
import { loadWorld, requireVay } from "@/lib/data";
import { brl, fmtDateTime, plural } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ExpeditionList } from "@/components/ExpeditionList";
import { SyncButton } from "./SyncButton";

export const metadata = { title: "Visão geral" };

export default async function OverviewPage() {
  await requireVay();
  const world = await loadWorld();
  const { partners, exps, ledger } = world;
  const supabase = await createClient();
  const { data: lastRun } = await supabase
    .from("sync_runs")
    .select("started_at, ok, error")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastTxt = !lastRun
    ? "Ainda não sincronizado"
    : lastRun.ok === false
      ? `Última tentativa ${fmtDateTime(lastRun.started_at)} falhou: ${lastRun.error ?? "erro"}`
      : `Última sincronização: ${fmtDateTime(lastRun.started_at)}`;
  const partnerById = new Map(partners.map((p) => [p.id, p]));

  const total = ledger.paid.reduce((a, r) => addMoney(a, r.com), ZERO);
  const allStats = exps.map((e) => ledger.expStats(e));
  const clientCount = allStats.reduce((a, t) => a + t.n, 0);
  const negotiating = allStats.reduce((a, t) => a + (t.stages.negociacao ?? 0) + (t.stages.em_contato ?? 0), 0);
  // Expedições que já terminaram e esperam a Vay confirmar (fechamento libera os créditos)
  const toFinish = exps.filter((e) => isDone(e) && !e.finished_at);
  const flagCount = ledger.resolved.filter((r) => r.needsReview).length;
  const pendingExps = exps
    .map((e) => ({ e, n: ledger.pendingFor(e) }))
    .filter((x) => x.n > 0);

  const partnerRows = partners.map((p) => {
    const ex = exps.filter((e) => e.partner_id === p.id);
    const st = ex.map((e) => ledger.expStats(e));
    const m = st.reduce((a, t) => addMoney(a, t), ZERO);
    return { p, exps: ex.length, clients: st.reduce((a, t) => a + t.n, 0), sold: m.sold, com: m.total };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Painel Vay Agora</div>
          <div className="ttl">
            <h1 className="page-title">Visão geral dos parceiros</h1>
            <Tip>Resultados de todos os parceiros, com base nos negócios do HubSpot marcados como de agência parceira.</Tip>
          </div>
        </div>
        <SyncButton last={lastTxt} />
      </div>

      <div className="grid-kpi">
        <Kpi accent label="Volume vendido pelas agências" value={brl(total.sold)} sub={plural(ledger.paid.length, "negócio vinculado", "negócios vinculados") + " a expedições"} />
        <Kpi label="Comissões dos parceiros" value={brl(total.total)} sub={`Liberadas e a liberar · ${plural(partners.length, "parceiro", "parceiros")}`} />
        <Kpi label="Clientes" value={String(clientCount)} sub={`Negócios das agências no HubSpot, em ${plural(exps.length, "expedição", "expedições")}`} />
        <Kpi label="Em contato ou negociação" value={String(negotiating)} sub="Pela etapa do negócio no HubSpot" />
      </div>

      {toFinish.length > 0 ? (
        <section className="card pad stack" style={{ borderColor: "var(--purple-300)", background: "var(--purple-50)" }}>
          <div className="ttl">
            <h2 className="section-title">{plural(toFinish.length, "expedição para finalizar", "expedições para finalizar")}</h2>
            <Tip>Expedições que já terminaram. Ao finalizar, a Vay confirma que a expedição aconteceu e os créditos são lançados no extrato do parceiro.</Tip>
          </div>
          <div className="row">
            {toFinish.map((e) => (
              <Link key={e.id} href={`/expedicoes/${e.id}`} className="btn outline sm">
                {e.name} · {partnerById.get(e.partner_id)?.name} · {brl(ledger.earnings(e.id).total)}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {flagCount > 0 ? (
        <section className="card pad stack" style={{ borderColor: "var(--red-300)", background: "var(--red-50)" }}>
          <div className="ttl">
            <h2 className="section-title">{plural(flagCount, "negócio para corrigir no HubSpot", "negócios para corrigir no HubSpot")}</h2>
            <Tip>Negócios não sinalizados como de agência parceira, ou da agência mas sem expedição compatível. Corrigidos no HubSpot, saem desta lista na próxima sincronização.</Tip>
          </div>
          <div className="row">
            {pendingExps.map(({ e, n }) => (
              <Link key={e.id} href={`/expedicoes/${e.id}#negocios`} className="btn outline sm">
                {e.name} · {partnerById.get(e.partner_id)?.name} · {n} para corrigir
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="card-head"><h2 className="section-title">Resultado por parceiro</h2></div>
        <div className="table-wrap">
          <table className="tbl" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>Parceiro</th>
                <th className="num">Expedições</th>
                <th className="num">Clientes</th>
                <th className="num">Volume vendido</th>
                <th className="num">Comissão do parceiro</th>
              </tr>
            </thead>
            <tbody>
              {partnerRows.map((r) => (
                <tr key={r.p.id}>
                  <td>
                    <Link href={`/parceiros/${r.p.id}`} className="strong">{r.p.name}</Link>
                    <div className="sub">{r.p.contact_email}</div>
                  </td>
                  <td className="num">{r.exps}</td>
                  <td className="num">{r.clients}</td>
                  <td className="num">{brl(r.sold)}</td>
                  <td className="num strong">{brl(r.com)}</td>
                </tr>
              ))}
              {partnerRows.length === 0 ? (
                <tr><td colSpan={5} className="empty">Nenhum parceiro ainda. <Link href="/parceiros">Cadastrar parceiro</Link></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack exp-sec" aria-label="Expedições">
        <div className="sec-head">
          <div className="ttl">
            <h2 className="section-title">Expedições</h2>
            <Badge tone="neutral">{exps.length}</Badge>
            <Tip>Para iniciar uma expedição, entre no parceiro.</Tip>
          </div>
        </div>
        <ExpeditionList exps={exps} world={world} isVay showPartner emptyText="Nenhuma expedição ainda." />
      </section>
    </>
  );
}
