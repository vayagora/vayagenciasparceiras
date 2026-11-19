import { describe, expect, it } from "vitest";
import { buildStatement, toRelease } from "./balance";
import { Ledger } from "./ledger";
import type { CreditEntry, Deal, Expedition, Partner } from "./types";

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
const credit = (id: string, created: string, amount: number, over: Partial<CreditEntry> = {}): CreditEntry => ({
  id, partner_id: "pJT", hubspot_id: id, created_on: created, title: id, kind: amount < 0 && over.kind !== "acumulo" ? "uso" : "acumulo", reason: "", amount, ...over,
});

describe("extrato de créditos (HubSpot: Créditos abertos + objeto Créditos)", () => {
  it("caso JT: saldo do HubSpot, acúmulo negativo respeitado, saldo de trás para frente", () => {
    const st = buildStatement({ ...jt, credit_balance: -1824.91 }, [
      credit("586335400315", "2026-09-09T15:35:01Z", -8633.08, { title: "Crédito JT Viajar e Correr", kind: "acumulo" }),
      credit("600858433313", "2026-10-27T18:43:25Z", 6808.17, { title: "3Q 2026", reason: "Programa Afiliados" }),
      credit("x", "2026-10-01T00:00:00Z", 999, { partner_id: "pX" }),
    ]);
    expect(st.balance).toBe(-1824.91);
    expect(st.rows.map((r) => [r.date, r.title, r.kind, r.amount, r.balance])).toEqual([
      ["2026-10-27", "3Q 2026", "in", 6808.17, -1824.91],
      ["2026-09-09", "Crédito JT Viajar e Correr", "out", -8633.08, -8633.08],
    ]);
    expect(st.gap).toBe(0);
    expect(st.totalIn).toBe(6808.17);
    expect(st.totalOut).toBe(8633.08);
    expect(st.rows[0]).toMatchObject({ sub: "Programa Afiliados", origin: "HubSpot" });
  });

  it("saldo do HubSpot diferente da soma: mostra a diferença", () => {
    const st = buildStatement({ ...jt, credit_balance: 100 }, [credit("a", "2026-10-01T00:00:00Z", 80)]);
    expect(st.gap).toBe(20);
    expect(st.rows[0].balance).toBe(100);
  });

  it("sem saldo sincronizado: usa a soma dos lançamentos", () => {
    expect(buildStatement({ ...jt, credit_balance: null }, [credit("a", "2026-10-01T00:00:00Z", 50), credit("b", "2026-10-02T00:00:00Z", -20, { kind: "uso" })]).balance).toBe(30);
  });

  it("comissão de expedição não finalizada fica a liberar, fora do saldo", () => {
    const ledger = new Ledger([deal("100", 9395), deal("200", 13160), deal("300", 5000, "Outra")], [jt, outro], [bkk]);
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
