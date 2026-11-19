// Saldo e extrato de créditos do parceiro (SPEC 2.3), como no sistema de comissários:
// saldo atual = "Créditos abertos" da empresa no HubSpot; lançamentos = registros do objeto "Créditos" associados.
// O saldo depois de cada lançamento é calculado de trás para frente a partir do saldo atual (do mais recente ao mais antigo).
// O ganho das expedições ainda não lançado no HubSpot aparece como "a liberar" (calculado pelo sistema).
import type { Ledger } from "./ledger";
import type { CreditEntry, Expedition, Partner } from "./types";

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

export type Statement = { rows: StatementRow[]; balance: number; totalIn: number; totalOut: number; countIn: number; countOut: number; gap: number };

export function buildStatement(partner: Partner, credits: CreditEntry[]): Statement {
  const mine = credits
    .filter((c) => c.partner_id === partner.id)
    .sort((a, b) => (a.created_on === b.created_on ? (a.hubspot_id < b.hubspot_id ? 1 : -1) : a.created_on < b.created_on ? 1 : -1));
  const sum = round2(mine.reduce((a, c) => a + Number(c.amount), 0));
  const balance = partner.credit_balance === null || partner.credit_balance === undefined ? sum : round2(Number(partner.credit_balance));
  let running = balance;
  const rows: StatementRow[] = mine.map((c) => {
    const amount = round2(Number(c.amount));
    const row: StatementRow = {
      key: c.hubspot_id,
      date: c.created_on.slice(0, 10),
      kind: amount < 0 ? "out" : "in",
      title: c.title || (c.kind === "uso" ? "Uso de créditos" : "Crédito"),
      sub: c.reason,
      origin: "HubSpot",
      amount,
      balance: round2(running),
    };
    running = round2(running - amount);
    return row;
  });
  const ins = rows.filter((r) => r.kind === "in");
  const outs = rows.filter((r) => r.kind === "out");
  return {
    rows,
    balance,
    totalIn: round2(ins.reduce((a, r) => a + r.amount, 0)),
    totalOut: round2(-outs.reduce((a, r) => a + r.amount, 0)),
    countIn: ins.length,
    countOut: outs.length,
    // Diferença entre o saldo do HubSpot e a soma dos lançamentos (corrigir no HubSpot)
    gap: round2(balance - sum),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Ganho das expedições ainda não finalizadas (a liberar), por expedição
export function toRelease(partner: Partner, ledger: Ledger, exps: Expedition[]): { exp: Expedition; total: number }[] {
  return exps
    .filter((e) => e.partner_id === partner.id && !e.finished_at)
    .map((e) => ({ exp: e, total: Math.round(ledger.earnings(e.id).total * 100) / 100 }))
    .filter((x) => x.total > 0);
}
