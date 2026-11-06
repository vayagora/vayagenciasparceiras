import { describe, expect, it } from "vitest";
import { hubspotConfig, money, parseRoteiro, pickTitular, toIsoDate, type Association } from "./hubspot";
import { mapDeal, planPassengers } from "./sync";

const a = (contactId: string, order: number, labels: string[] = []): Association => ({ contactId, order, labels });

describe("titular do negócio (rótulo de associação)", () => {
  it("usa o contato com o rótulo 'Titular'", () => {
    expect(pickTitular([a("1", 0), a("2", 1, ["Titular"])], "Titular")).toEqual({ titularId: "2", labeled: true });
  });

  it("ignora acentos e maiúsculas no rótulo", () => {
    expect(pickTitular([a("1", 0, ["titular"])], "Titular").labeled).toBe(true);
  });

  it("sem rótulo: o contato associado há mais tempo, com sinalização", () => {
    const seen = new Map([
      ["1", "2026-10-05T00:00:00Z"],
      ["2", "2026-10-01T00:00:00Z"],
    ]);
    expect(pickTitular([a("1", 0), a("2", 1)], "Titular", seen)).toEqual({ titularId: "2", labeled: false });
  });

  it("sem rótulo e na primeira sincronização: o primeiro da lista de associações", () => {
    expect(pickTitular([a("7", 0), a("8", 1)], "Titular")).toEqual({ titularId: "7", labeled: false });
  });

  it("planPassengers: um titular, preserva a data da primeira associação", () => {
    const contacts = new Map([
      ["1", { id: "1", name: "Emerson Souza", email: "emerson@email.com", phone: "" }],
      ["2", { id: "2", name: "Gislaine Souza", email: "gislaine@email.com", phone: "" }],
    ]);
    const seen = new Map([["1", "2026-09-01T00:00:00Z"]]);
    const plan = planPassengers([a("1", 0, ["Titular"]), a("2", 1)], contacts, seen, "Titular", "2026-11-06T00:00:00Z");
    expect(plan.labeled).toBe(true);
    expect(plan.rows.filter((r) => r.is_titular).map((r) => r.name)).toEqual(["Emerson Souza"]);
    expect(plan.rows.map((r) => r.first_seen_at)).toEqual(["2026-09-01T00:00:00Z", "2026-11-06T00:00:00Z"]);
  });
});

describe("conversões do negócio", () => {
  it("roteiro em texto, normalizando cidade e ordenando por data", () => {
    expect(parseRoteiro("madrid|2026-11-13; Lisboa|2026-11-09")).toEqual([
      { city: "Lisboa", date: "2026-11-09" },
      { city: "Madrid", date: "2026-11-13" },
    ]);
  });

  it("roteiro em JSON", () => {
    expect(parseRoteiro('[{"city":"Sao Paulo","date":"2026-12-01"}]')).toEqual([{ city: "São Paulo", date: "2026-12-01" }]);
  });

  it("roteiro inválido vira lista vazia", () => {
    expect(parseRoteiro("[quebrado")).toEqual([]);
    expect(parseRoteiro("")).toEqual([]);
  });

  it("datas do HubSpot no fuso de São Paulo", () => {
    expect(toIsoDate("2026-11-19")).toBe("2026-11-19");
    expect(toIsoDate("2026-10-01T02:00:00Z")).toBe("2026-09-30");
    expect(toIsoDate(String(Date.UTC(2026, 10, 19, 12)))).toBe("2026-11-19");
    expect(toIsoDate("")).toBeNull();
  });

  it("valores", () => {
    expect(money("1234.5")).toBe(1234.5);
    expect(money(null)).toBe(0);
  });

  it("mapDeal usa os nomes de propriedade configurados", () => {
    const cfg = hubspotConfig({ HUBSPOT_TOKEN: "x", HUBSPOT_PROP_AFILIADO: "parceiro" })!;
    const row = mapDeal(
      {
        id: "4512",
        properties: {
          parceiro: "Horizonte Eventos",
          closedate: "2026-09-01T15:00:00Z",
          roteiro: "Madrid|2026-11-12",
          data_volta: "2026-11-19",
          valor_voo: "8000",
          valor_hospedagem: "6000",
          valor_seguro: "600",
        },
      },
      cfg,
    );
    expect(row).toMatchObject({ hubspot_id: "4512", afiliado: "Horizonte Eventos", closed_on: "2026-09-01", voo: 8000, end_date: "2026-11-19" });
  });

  it("sem token, a integração fica desligada", () => {
    expect(hubspotConfig({})).toBeNull();
  });
});
