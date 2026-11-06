import Link from "next/link";
import { addMoney, PRODUCTS, PROD_LABEL, STAGES, ZERO, type Money } from "@/lib/commission";
import { cityLabel } from "@/lib/cities";
import type { World } from "@/lib/data";
import { brl, lastClosedQuarter, QLABEL, quarterOf, todayIso } from "@/lib/format";
import type { Partner } from "@/lib/types";
import { PeriodFilter } from "./PeriodFilter";
import { Kpi, Tip } from "./ui";

type Props = {
  partner: Partner;
  world: World;
  isVay: boolean;
  year?: string;
  quarter?: string;
  basePath: string;
};

export function PartnerDashboard({ partner, world, isVay, year, quarter, basePath }: Props) {
  const { ledger } = world;
  const lq = lastClosedQuarter();
  const pYear = Number(year) || lq.y;
  const pQ = quarter === "all" || ["1", "2", "3", "4"].includes(quarter ?? "") ? quarter! : String(lq.q);
  const inPeriod = (iso: string) => {
    const q = quarterOf(iso);
    return q.y === pYear && (pQ === "all" || String(q.q) === pQ);
  };

  const exps = world.exps.filter((e) => e.partner_id === partner.id);
  const expIds = new Set(exps.map((e) => e.id));
  const periodDeals = ledger.paid.filter((r) => expIds.has(r.exp!.id) && inPeriod(r.deal.closed_on));
  const sum = periodDeals.reduce((a, r) => addMoney(a, r.com), ZERO);
  const stats = exps.map((e) => ({ e, t: ledger.expStats(e) }));
  const totalClients = stats.reduce((a, x) => a + x.t.n, 0);

  const periodShort = pQ === "all" ? `Ano de ${pYear}` : `${pQ}º tri/${pYear}`;
  const periodLabel = pQ === "all" ? `Ano de ${pYear} · jan–dez` : `${QLABEL[Number(pQ)]} de ${pYear}`;
  const isDefault = pYear === lq.y && pQ === String(lq.q);
  const now = quarterOf(todayIso());
  let periodHint = isDefault ? "Último trimestre concluído (horário de Brasília)" : "Pela data de fechamento do negócio no HubSpot";
  if (pYear === now.y && (pQ === "all" || Number(pQ) === now.q)) periodHint = "Período em andamento — valores parciais";

  const years = new Set<number>([now.y, lq.y]);
  world.deals.forEach((d) => years.add(quarterOf(d.closed_on).y));

  const byExp = exps
    .map((e) => {
      const ds = periodDeals.filter((r) => r.exp!.id === e.id);
      return { e, t: ds.reduce<Money>((a, r) => addMoney(a, r.com), ZERO), n: ds.length };
    })
    .filter((x) => x.n > 0);
  const maxTotal = Math.max(1, ...byExp.map((x) => x.t.total));

  return (
    <>
      <div className="page-head">
        <div>
          {isVay ? <Link href="/parceiros" className="back">← Todos os parceiros</Link> : null}
          <div className="eyebrow">{isVay ? "Painel do parceiro · visão Vay Agora" : "Painel do parceiro"}</div>
          <div className="ttl">
            <h1 className="page-title">{isVay ? partner.name : `Olá, ${partner.name}`}</h1>
            <Tip>
              {isVay
                ? "Exatamente o que este parceiro vê no painel dele: ganhos por período, por expedição e andamento dos clientes."
                : "Acompanhe seus ganhos e o andamento das compras de cada expedição."}
            </Tip>
          </div>
        </div>
        <div className="row">
          {!isVay ? <Link href="/expedicoes?nova=1" className="btn primary">Iniciar expedição</Link> : null}
          <Link href={isVay ? `/expedicoes?parceiro=${partner.id}` : "/expedicoes"} className="btn outline">Ver expedições</Link>
        </div>
      </div>

      <div className="card pad row" style={{ justifyContent: "space-between" }}>
        <div className="stack" style={{ gap: 4 }}>
          <div className="eyebrow">Período dos ganhos</div>
          <div className="ttl">
            <span className="strong" style={{ fontSize: 18 }}>{periodLabel}</span>
            <Tip>{periodHint}</Tip>
          </div>
        </div>
        <PeriodFilter basePath={basePath} year={String(pYear)} quarter={pQ} years={[...years].sort((a, b) => b - a)} isDefault={isDefault} />
      </div>

      <div className="grid-kpi">
        <Kpi accent label={isVay ? "Ganhos do parceiro no período" : "Seus ganhos no período"} value={brl(sum.total)} sub={periodShort} />
        <Kpi label="Volume vendido pela Vay Agora" value={brl(sum.sold)} sub="Voos, hospedagens e seguros no período" />
        <Kpi label="Negócios fechados" value={String(periodDeals.length)} sub="No período selecionado" />
        <Kpi label="Clientes cadastrados" value={String(totalClients)} sub={`${exps.length} ${exps.length === 1 ? "expedição" : "expedições"} · todos os períodos`} />
      </div>

      <div className="grid-rates">
        <RateCard pct="2%" label="Por voo vendido" detail={`${periodShort}: ${brl(sum.voo)}`} bg="var(--blue-50)" fg="var(--blue-700)" />
        <RateCard pct="3%" label="Por hospedagem vendida" detail={`${periodShort}: ${brl(sum.hotel)}`} bg="var(--purple-50)" fg="var(--purple-700)" />
        <RateCard pct="5%" label="Por seguro viagem vendido" detail={`${periodShort}: ${brl(sum.seguro)}`} bg="var(--yellow-100)" fg="var(--yellow-900)" />
      </div>

      <section className="card">
        <div className="card-head">
          <div className="ttl">
            <h2 className="section-title">Ganhos por expedição · {periodShort}</h2>
            <Tip>Comissões sobre negócios fechados pela Vay Agora no período, pela data de fechamento.</Tip>
          </div>
        </div>
        <div className="table-wrap">
          <table className="tbl" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>Expedição</th>
                <th className="num">Negócios</th>
                <th className="num">Voos · 2%</th>
                <th className="num">Hospedagem · 3%</th>
                <th className="num">Seguro · 5%</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {byExp.length === 0 ? (
                <tr><td colSpan={6} className="empty">Nenhum negócio fechado neste período.</td></tr>
              ) : (
                byExp.map(({ e, t, n }) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/expedicoes/${e.id}`} className="strong">{e.name}</Link>
                      <div className="sub">{cityLabel(e.city)}</div>
                      <div className="bar" style={{ marginTop: 8, maxWidth: 240 }}><span style={{ width: `${Math.round((t.total / maxTotal) * 100)}%` }} /></div>
                    </td>
                    <td className="num">{n}</td>
                    <td className="num">{brl(t.voo)}</td>
                    <td className="num">{brl(t.hotel)}</td>
                    <td className="num">{brl(t.seguro)}</td>
                    <td className="num strong">{brl(t.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {byExp.length ? (
              <tfoot>
                <tr>
                  <td>Total do período</td>
                  <td className="num">{periodDeals.length}</td>
                  <td className="num">{brl(sum.voo)}</td>
                  <td className="num">{brl(sum.hotel)}</td>
                  <td className="num">{brl(sum.seguro)}</td>
                  <td className="num">{brl(sum.total)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>

      <section className="card pad stack">
        <div className="ttl">
          <h2 className="section-title">Andamento dos clientes</h2>
          <Tip>
            {isVay
              ? "Situação atual dos clientes que o parceiro cadastrou, em todas as expedições."
              : "Situação atual dos clientes que você cadastrou, em todas as expedições."}
          </Tip>
        </div>
        <div className="legend">
          {STAGES.map((s) => (
            <span key={s.id}><i style={{ background: s.color }} />{s.label}</span>
          ))}
        </div>
        {stats.length === 0 ? <p className="muted">Nenhuma expedição ainda.</p> : null}
        {stats.map(({ e, t }) => (
          <div key={e.id} className="stack" style={{ gap: 10, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <Link href={`/expedicoes/${e.id}`} className="strong">{e.name} · {cityLabel(e.city)}</Link>
              <span className="small muted">{t.n} clientes · {t.closed} com compra concluída</span>
            </div>
            <div className="stagebar" aria-hidden={t.n === 0}>
              {STAGES.filter((s) => t.stages[s.id]).map((s) => (
                <span key={s.id} title={`${s.label}: ${t.stages[s.id]}`} style={{ flex: `${t.stages[s.id]} 1 0`, background: s.color }} />
              ))}
            </div>
            <div className="grid-rates" style={{ gap: 12 }}>
              {PRODUCTS.map((k) => (
                <div key={k} className="stack" style={{ gap: 4 }}>
                  <div className="row small" style={{ justifyContent: "space-between" }}>
                    <span>{PROD_LABEL[k]} comprado</span>
                    <span className="muted">{t.bought[k]} de {t.n}</span>
                  </div>
                  <div className="bar"><span style={{ width: `${Math.round((t.bought[k] / (t.n || 1)) * 100)}%`, background: "var(--purple-500)" }} /></div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function RateCard({ pct, label, detail, bg, fg }: { pct: string; label: string; detail: string; bg: string; fg: string }) {
  return (
    <div className="card rate">
      <div className="dot" style={{ background: bg, color: fg }}>{pct}</div>
      <div className="stack" style={{ gap: 2 }}>
        <div className="strong">{label}</div>
        <div className="small muted">{detail}</div>
      </div>
    </div>
  );
}
