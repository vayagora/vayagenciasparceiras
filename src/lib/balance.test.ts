import { describe, expect, it } from "vitest";
import { buildStatement, toRelease } from "./balance";
import { Ledger } from "./ledger";
import type { BalanceEntry, Deal, Expedition, Partner } from "./types";

const jt: Partner = { id: "pJT", name: "JT Viajar e Correr", afiliado: "JT Viajar e Correr", contact_email: null, created_at: "" };
const outro: Partner = { ...jt, id: "pX", name: "Outra", afiliado: "Outra" };
const bkk: Expedition = { id: "e1", partner_id: "pJT", name: "Tailândia 2026", city: "Tailândia", start_date: "2026-12-01", days: 15, arrival_airport: "BKK", departure_airport: "GRU", created_at: "" };

const deal = (id: string, voo: number, afiliado = "JT Viajar e Correr", over: Partial<Deal> = {}): Deal => ({
  id, hubspot_id: id, seq: 1, name: "", hs_stage: "135525686", stage_kind: "won", partner_note: "", signaled: true, hs_origem: "Afiliado", hs_agency: afiliado,
  details: {}, payment_methods: [], cashback_override: null, afiliado, closed_on: "2026-10-09",
  legs: [{ city: "Bangkok", date: "2026-11-30", lat: 13.68, lng: 100.75 }], end_date: "2026-12-16",
  voo, hotel: 0, seguro: 0, override_expedition_id: null, override_none: false, reviewed: false,
  passenger_count: 1, titular_labeled: true,
  passengers: [{ id: `px${id}`, deal_id: id, hubspot_contact_id: `c${id}`, name: `Pax ${id}`, email: "", phone: "", is_titular: true, is_buyer: true, is_passenger: true, first_seen_at: "", position: 0 }],
  ...over,
});
const entry = (id: string, kind: "in" | "out", amount: number, date: string, over: Partial<BalanceEntry> = {}): BalanceEntry => ({
  id, partner_id: "pJT", kind, amount, entry_date: date, title: kind === "in" ? "Bonificação" : "Passagem da guia", note: "", created_by_name: "Gabriel", created_at: "", ...over,
});

describe("extrato do saldo (créditos liberados pelo fechamento da expedição)", () => {
  it("só lançamentos entram no saldo: fechamento da expedição + manuais antigos; saldo corrente", () => {
    const st = buildStatement(
      jt,
      [
        entry("f", "in", 676.65, "2026-12-20", { expedition_id: "e1", title: "Créditos da expedição Tailândia 2026", note: "2 negócios" }),
        entry("b", "out", 300, "2026-12-22"),
        entry("z", "in", 999, "2026-12-10", { partner_id: "pX" }),
      ],
      [bkk],
    );
    expect(st.rows.map((r) => [r.date, r.amount, r.balance])).toEqual([
      ["2026-12-22", -300, 376.65],
      ["2026-12-20", 676.65, 676.65],
    ]);
    expect(st.balance).toBe(376.65);
    expect(st.rows[1]).toMatchObject({ kind: "in", sub: "Tailândia 2026", origin: "Fechamento da expedição · Gabriel" });
    expect(st.rows[0]).toMatchObject({ origin: "Manual · Gabriel" });
  });

  it("comissão de expedição não finalizada fica a liberar, fora do saldo", () => {
    const ledger = new Ledger([deal("100", 9395), deal("200", 13160), deal("300", 5000, "Outra")], [jt, outro], [bkk]);
    expect(buildStatement(jt, [], [bkk]).balance).toBe(0);
    // 9395 × 3% = 281,85 · 13160 × 3% = 394,80
    expect(toRelease(jt, ledger, [bkk])).toEqual([{ exp: bkk, total: 676.65 }]);
    // finalizada: sai do "a liberar"
    expect(toRelease(jt, ledger, [{ ...bkk, finished_at: "2026-12-20T12:00:00Z" }])).toEqual([]);
  });

  it("negócio em aberto não entra no a liberar", () => {
    const ledger = new Ledger([deal("100", 9395, "JT Viajar e Correr", { stage_kind: "open", closed_on: null })], [jt], [bkk]);
    expect(toRelease(jt, ledger, [bkk])).toEqual([]);
  });
});
