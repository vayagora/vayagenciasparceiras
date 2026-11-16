import Link from "next/link";
import { buildStatement, toRelease } from "@/lib/balance";
import { addMoney, pct, RATES, ZERO } from "@/lib/commission";
import type { World } from "@/lib/data";
import { brl, lastClosedQuarter, plural, QLABEL, quarterOf, todayIso } from "@/lib/format";
import type { Partner } from "@/lib/types";
import { PeriodFilter } from "./PeriodFilter";
import { Tip } from "./ui";

// Bloco "Ganhos" (protótipo v37): saldo atual, indicadores do período e ganhos por produto, num card só.
// Mesmos cálculos do painel anterior (comissões por data de fechamento; saldo pelo extrato).
export function EarningsBlock({
  partner,
  world,
  isVay,
  year,
  quarter,
  basePath,
}: {
  partner: Partner;
  world: World;
  isVay: boolean;
  year?: string;
  quarter?: string;
  basePath: string;
}) {
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
  const periodDeals = ledger.paid.filter((r) => expIds.has(r.exp!.id) && inPeriod(r.deal.closed_on ?? ""));
  const sum = periodDeals.reduce((a, r) => addMoney(a, r.com), ZERO);
  const stats = exps.map((e) => ledger.expStats(e));
  const totalClients = stats.reduce((a, t) => a + t.n, 0);
  const totalClosed = stats.reduce((a, t) => a + t.closed, 0);
  const st = buildStatement(partner, world.entries, world.exps);
  const pendingRelease = toRelease(partner, ledger, world.exps).reduce((a, x) => a + x.total, 0);

  const periodShort = pQ === "all" ? `Ano de ${pYear}` : `${pQ}º tri/${pYear}`;
  const periodLabel = pQ === "all" ? `Ano de ${pYear} · jan–dez` : `${QLABEL[Number(pQ)]} de ${pYear}`;
  const isDefault = pYear === lq.y && pQ === String(lq.q);
  const now = quarterOf(todayIso());
  let periodHint = isDefault ? "Último trimestre concluído (horário de Brasília)" : "Pela data de fechamento do negócio no HubSpot";
  if (pYear === now.y && (pQ === "all" || Number(pQ) === now.q)) periodHint = "Período em andamento — valores parciais";
  const years = new Set<number>([now.y, lq.y]);
  world.deals.forEach((d) => d.closed_on && years.add(quarterOf(d.closed_on).y));

  const rates = [
    { pct: pct(RATES.voo), label: "Voo", value: sum.voo, bg: "var(--blue-50)", fg: "var(--blue-700)" },
    { pct: pct(RATES.hotel), label: "Hospedagem", value: sum.hotel, bg: "var(--purple-50)", fg: "var(--purple-700)" },
    { pct: pct(RATES.seguro), label: "Seguro", value: sum.seguro, bg: "var(--yellow-100)", fg: "var(--yellow-900)" },
  ];

  return (
    <section className="card earn" aria-label="Ganhos">
      <div className="earn-head">
        <div className="ttl" style={{ gap: 8 }}>
          <h2 className="section-title">Ganhos</h2>
          <span className="muted">·</span>
          <span className="pl">{periodLabel}</span>
          <Tip>{periodHint}</Tip>
        </div>
        <PeriodFilter basePath={basePath} year={String(pYear)} quarter={pQ} years={[...years].sort((a, b) => b - a)} isDefault={isDefault} />
      </div>
      <div className="earn-body">
        <div className="earn-bal">
          <span className="l">Saldo atual</span>
          <span className="v">{brl(st.balance)}</span>
          <span className="s">A liberar {brl(pendingRelease)} · entra quando a expedição é finalizada</span>
          <Link href={isVay ? `/parceiros/${partner.id}/extrato` : "/extrato"}>Ver extrato</Link>
        </div>
        <div className="earn-stats">
          <div className="estat">
            <span className="l">{isVay ? "Ganhos do parceiro no período" : "Ganhos no período"}</span>
            <span className="v">{brl(sum.total)}</span>
            <span className="s">{periodShort}</span>
          </div>
          <div className="estat">
            <span className="l">Negócios fechados</span>
            <span className="v">{periodDeals.length}</span>
            <span className="s">No período</span>
          </div>
          <div className="estat">
            <span className="l">Clientes</span>
            <span className="v">{totalClients}</span>
            <span className="s hl">{plural(totalClosed, "compra concluída", "compras concluídas")}</span>
          </div>
        </div>
      </div>
      <div className="earn-rates">
        <span>Ganhos por produto no período:</span>
        {rates.map((r) => (
          <span key={r.label} className="rchip">
            <b style={{ background: r.bg, color: r.fg }}>{r.pct}</b>
            {r.label} <strong>{brl(r.value)}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}
