// Saldo do parceiro (SPEC 2.0): os créditos entram pelo fechamento de cada expedição, quando a Vay confirma
// que ela aconteceu. Antes disso, o ganho da expedição aparece como "a liberar" e não entra no saldo.
// Lançamentos manuais antigos (entradas e saídas) continuam no extrato. Saldo = entradas − saídas.
import type { Ledger } from "./ledger";
import type { BalanceEntry, Expedition, Partner } from "./types";

export type StatementRow = {
  key: string;
  date: string;
  kind: "in" | "out";
  title: string;
  sub: string;
  origin: string;
  amount: number; // com sinal: + entrada, − saída
  balance: number; // saldo depois deste lançamento
};

export type Statement = { rows: StatementRow[]; balance: number; totalIn: number; totalOut: number; countIn: number; countOut: number };

export function buildStatement(partner: Partner, entries: BalanceEntry[], exps: Expedition[] = []): Statement {
  const expName = new Map(exps.map((e) => [e.id, e.name]));
  const items: Omit<StatementRow, "balance">[] = [];
  for (const e of entries) {
    if (e.partner_id !== partner.id) continue;
    const v = Math.abs(Number(e.amount) || 0);
    const closing = !!e.expedition_id;
    items.push({
      key: `entry-${e.id}`,
      date: e.entry_date,
      kind: e.kind,
      title: e.title,
      sub: closing ? expName.get(e.expedition_id!) ?? e.note : e.note,
      origin: closing
        ? `Fechamento da expedição${e.created_by_name ? ` · ${e.created_by_name}` : ""}`
        : `Manual${e.created_by_name ? ` · ${e.created_by_name}` : ""}`,
      amount: e.kind === "in" ? v : -v,
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

// Ganho das expedições ainda não finalizadas (a liberar), por expedição
export function toRelease(partner: Partner, ledger: Ledger, exps: Expedition[]): { exp: Expedition; total: number }[] {
  return exps
    .filter((e) => e.partner_id === partner.id && !e.finished_at)
    .map((e) => ({ exp: e, total: Math.round(ledger.earnings(e.id).total * 100) / 100 }))
    .filter((x) => x.total > 0);
}
