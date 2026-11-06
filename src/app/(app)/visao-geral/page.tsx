import Link from "next/link";
import { Badge, Kpi, Tip } from "@/components/ui";
import { addMoney, stageOf, ZERO } from "@/lib/commission";
import { loadWorld, requireVay } from "@/lib/data";
import { brl, fmtDate, fmtDateTime, plural } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { SyncButton } from "./SyncButton";

export const metadata = { title: "Visão geral" };

export default async function OverviewPage() {
  await requireVay();
  const { partners, exps, clients, ledger } = await loadWorld();
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
  const expById = new Map(exps.map((e) => [e.id, e]));

  const total = ledger.paid.reduce((a, r) => addMoney(a, r.com), ZERO);
  const pending = clients.filter((c) => ["novo", "contato"].includes(ledger.shownStage(c)));
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
            <Tip>Resultados de todos os parceiros, com base nos negócios do HubSpot marcados com o campo afiliado.</Tip>
          </div>
        </div>
        <SyncButton last={lastTxt} />
      </div>

      <div className="grid-kpi">
        <Kpi accent label="Volume vendido a afiliados" value={brl(total.sold)} sub={plural(ledger.paid.length, "negócio vinculado", "negócios vinculados") + " a expedições"} />
        <Kpi label="Comissões a repassar" value={brl(total.total)} sub={`Para ${plural(partners.length, "parceiro", "parceiros")}`} />
        <Kpi label="Clientes cadastrados" value={String(clients.length)} sub={`Pelos parceiros, em ${plural(exps.length, "expedição", "expedições")}`} />
        <Kpi label="Follow-ups pendentes" value={String(pending.length)} sub="Aguardando contato ou em atendimento" />
      </div>

      {flagCount > 0 ? (
        <section className="card pad stack" style={{ borderColor: "var(--yellow-300)", background: "var(--yellow-50)" }}>
          <div className="ttl">
            <h2 className="section-title">{plural(flagCount, "negócio para conferir", "negócios para conferir")}</h2>
            <Tip>Negócios que pedem conferência manual. A conferência é feita na tela de cada expedição; negócios sem expedição aparecem nas expedições do respectivo parceiro.</Tip>
          </div>
          <div className="row">
            {pendingExps.map(({ e, n }) => (
              <Link key={e.id} href={`/expedicoes/${e.id}#negocios`} className="btn outline sm">
                {e.name} · {partnerById.get(e.partner_id)?.name} · {n} para conferir
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

      <section className="card">
        <div className="card-head">
          <div className="ttl">
            <h2 className="section-title">Follow-ups pendentes</h2>
            <Tip>Clientes cadastrados pelos parceiros, aguardando contato ou em atendimento.</Tip>
          </div>
        </div>
        <div className="table-wrap">
          <table className="tbl" style={{ minWidth: 860 }}>
            <thead>
              <tr><th>Cliente</th><th>Expedição</th><th>Etapa</th><th>Último contato</th><th>Ação</th></tr>
            </thead>
            <tbody>
              {pending.map((c) => {
                const e = expById.get(c.expedition_id);
                const st = stageOf(ledger.shownStage(c));
                return (
                  <tr key={c.id}>
                    <td><span className="strong">{c.name}</span><div className="sub">{c.phone || c.email}</div></td>
                    <td>{e?.name}<div className="sub">{e ? partnerById.get(e.partner_id)?.name : ""}</div></td>
                    <td><Badge tone={st.tone} dot>{st.label}</Badge></td>
                    <td>{c.last_follow_up ? fmtDate(c.last_follow_up) : "Sem contato"}</td>
                    <td><Link href={`/expedicoes/${c.expedition_id}?cliente=${c.id}`} className="btn secondary sm">Atualizar</Link></td>
                  </tr>
                );
              })}
              {pending.length === 0 ? <tr><td colSpan={5} className="empty">Nenhum follow-up pendente.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
