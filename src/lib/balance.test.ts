import { describe, expect, it } from "vitest";
import { buildStatement } from "./balance";
import { Ledger } from "./ledger";
import type { BalanceEntry, Client, Deal, Expedition, Partner } from "./types";

const jt: Partner = { id: "pJT", name: "JT Viajar e Correr", afiliado: "JT Viajar e Correr", contact_email: null, created_at: "" };
const outro: Partner = { ...jt, id: "pX", name: "Outra", afiliado: "Outra" };
const bkk: Expedition = { id: "e1", partner_id: "pJT", name: "Tailândia 2026", city: "Tailândia", start_date: "2026-12-01", days: 15, arrival_airport: "BKK", departure_airport: "GRU", created_at: "" };

const deal = (id: string, closed: string, voo: number, afiliado = "JT Viajar e Correr"): Deal => ({
  id, hubspot_id: id, seq: 1, name: "", signaled: true, hs_origem: "Afiliado", hs_agency: afiliado, details: {}, payment_methods: [], cashback_override: null,
  afiliado, closed_on: closed, legs: [{ city: "Bangkok", date: "2026-11-30", lat: 13.68, lng: 100.75 }], end_date: "2026-12-16",
  voo, hotel: 0, seguro: 0, override_expedition_id: null, override_none: false, reviewed: false,
  passenger_count: 1, titular_labeled: true, passengers: [],
});
const entry = (id: string, kind: "in" | "out", amount: number, date: string, partner_id = "pJT"): BalanceEntry => ({
  id, partner_id, kind, amount, entry_date: date, title: kind === "in" ? "Bonificação" : "Passagem da guia", note: "", created_by_name: "Gabriel", created_at: "",
});
const clients: Client[] = [];

describe("extrato do saldo", () => {
  const ledger = new Ledger([deal("100", "2026-10-09", 9395), deal("200", "2026-10-14", 13160), deal("300", "2026-10-01", 5000, "Outra")], [jt, outro], [bkk], clients);

  it("comissões entram sozinhas; lançamentos manuais somam e subtraem; saldo corrente", () => {
    const st = buildStatement(jt, ledger, [entry("a", "in", 100, "2026-10-10"), entry("b", "out", 300, "2026-10-20"), entry("z", "in", 999, "2026-10-10", "pX")]);
    // 9395 × 3% = 281,85 · 13160 × 3% = 394,80
    expect(st.rows.map((r) => [r.date, r.amount, r.balance])).toEqual([
      ["2026-10-20", -300, 476.65],
      ["2026-10-14", 394.8, 776.65],
      ["2026-10-10", 100, 381.85],
      ["2026-10-09", 281.85, 281.85],
    ]);
    expect(st.balance).toBe(476.65);
    expect(st.totalIn).toBe(776.65);
    expect(st.totalOut).toBe(300);
    expect(st.rows[0]).toMatchObject({ kind: "out", origin: "Manual · Gabriel", entryId: "b" });
    expect(st.rows[3]).toMatchObject({ kind: "in", title: "Comissão · Voo", sub: "Tailândia 2026", origin: "HubSpot · negócio #100" });
  });

  it("negócio de outro parceiro e lançamento de outro parceiro não entram", () => {
    const st = buildStatement(jt, ledger, [entry("z", "in", 999, "2026-10-10", "pX")]);
    expect(st.rows.every((r) => !r.key.includes("300") && r.entryId !== "z")).toBe(true);
  });
});
