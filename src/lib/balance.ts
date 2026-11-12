// Saldo do parceiro: comissões dos negócios vinculados (entram sozinhas) + lançamentos manuais da Vay
// (entradas, como bonificações, e saídas, quando a agência usa os créditos). Saldo = entradas − saídas.
import { PROD_LABEL, PRODUCTS } from "./commission";
import type { Ledger } from "./ledger";
import { dealNo } from "./matching";
import type { BalanceEntry, Partner } from "./types";

export type StatementRow = {
  key: string;
  date: string;
  kind: "in" | "out";
  title: string;
  sub: string;
  origin: string;
  amount: number; // com sinal: + entrada, − saída
  balance: number; // saldo depois deste lançamento
  entryId?: string; // lançamento manual (pode ser apagado pela Vay)
};

export type Statement = { rows: StatementRow[]; balance: number; totalIn: number; totalOut: number; countIn: number; countOut: number };

export function buildStatement(partner: Partner, ledger: Ledger, entries: BalanceEntry[]): Statement {
  const items: Omit<StatementRow, "balance">[] = [];
  for (const r of ledger.paid) {
    if (r.partner?.id !== partner.id || r.com.total <= 0) continue;
    const prods = PRODUCTS.filter((k) => Number(r.deal[k]) > 0).map((k) => PROD_LABEL[k]).join(" + ");
    items.push({
      key: `deal-${r.deal.id}`,
      date: r.deal.closed_on,
      kind: "in",
      title: `Comissão · ${prods}`,
      sub: r.exp ? r.exp.name : "",
      origin: `HubSpot · negócio ${dealNo(r.deal)}`,
      amount: Math.round(r.com.total * 100) / 100,
    });
  }
  for (const e of entries) {
    if (e.partner_id !== partner.id) continue;
    const v = Math.abs(Number(e.amount) || 0);
    items.push({
      key: `entry-${e.id}`,
      date: e.entry_date,
      kind: e.kind,
      title: e.title,
      sub: e.note,
      origin: `Manual${e.created_by_name ? ` · ${e.created_by_name}` : ""}`,
      amount: e.kind === "in" ? v : -v,
      entryId: e.id,
    });
  }
  // Ordem cronológica para o saldo corrente; exibição do mais recente para o mais antigo.
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key < b.key ? -1 : 1));
  let running = 0;
  const rows = items.map((it) => {
    running = Math.round((running + it.amount) * 100) / 100;
    return { ...it, balance: running };
  });
  const totalIn = rows.filter((r) => r.kind === "in").reduce((a, r) => a + r.amount, 0);
  const totalOut = rows.filter((r) => r.kind === "out").reduce((a, r) => a - r.amount, 0);
  return {
    rows: rows.reverse(),
    balance: running,
    totalIn: Math.round(totalIn * 100) / 100,
    totalOut: Math.round(totalOut * 100) / 100,
    countIn: rows.filter((r) => r.kind === "in").length,
    countOut: rows.filter((r) => r.kind === "out").length,
  };
}
