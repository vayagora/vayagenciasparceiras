import { describe, expect, it } from "vitest";
import { airportPlace, hubspotConfig, money, normalizeCity, pickTitular, readTrip, toIsoDate, type Association } from "./hubspot";
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

// Negócio aéreo no formato da conta da Vay Agora (ida por Dubai até Bangkok, volta pelo Rio)
const aereo = {
  servico: "Passagem Aérea",
  amount: "23570",
  closedate: "2026-07-20T21:34:43.853Z",
  agencia_parceira: "JT Viajar e Correr",
  aeroporto_de_partida: "DXB – Dubai, United Arab Emirates – Intl,",
  data_da_volta_: "2026-11-27",
  aeroporto_de_chegada___trecho_2: "BKK – Bangkok, Thailand – Bangkok Intl Airport,",
  data_de_chegada___trecho_2: "2026-11-28",
  destino___trecho_3: "GIG – RJ, Brasil – Tom Jobim Intl,",
  data_da_ida_: "2026-12-16",
  destino___trecho_4: "CNF – Belo Horizonte, Brasil – Tancredo Neves,",
  data_da_partida___trecho_2: "2026-12-19",
};

describe("aeroportos do HubSpot", () => {
  it("aeroporto perto de uma cidade da lista vira essa cidade", () => {
    expect(airportPlace("GRU – SP, Brasil – Guarulhos / F. Montoro,")?.city).toBe("São Paulo");
    expect(airportPlace("BKK – Bangkok, Thailand – Bangkok Intl Airport,")?.city).toBe("Bangkok");
    expect(airportPlace("GIG – RJ, Brasil – Tom Jobim Intl,")?.city).toBe("Rio de Janeiro");
  });

  it("códigos de cidade e valores sem código", () => {
    expect(airportPlace("LON - Londres")?.city).toBe("Londres");
    expect(airportPlace("Haneda")?.city).toBe("Tóquio");
  });

  it("aeroporto fora da lista de cidades mantém nome e coordenadas", () => {
    const p = airportPlace("VCP – Campinas, São Paulo, Brasil – Viracopos,");
    expect(p?.city).toBe("Campinas"); // ~80 km de São Paulo: não vira São Paulo
    expect(p?.lat).toBeTypeOf("number");
  });

  it("aeroporto pequeno sem coordenada fica só com o nome", () => {
    expect(airportPlace("JDR - São João Del Rei")).toEqual({ city: "São João Del Rei" });
  });

  it("normaliza cidade digitada", () => {
    expect(normalizeCity("bangkok, Tailândia")).toBe("Bangkok");
    expect(normalizeCity("Sao Paulo")).toBe("São Paulo");
  });
});

describe("leitura do negócio (Serviço, valor, roteiro)", () => {
  it("aéreo: trechos em ordem de data, volta = último trecho, valor no voo", () => {
    const t = readTrip(aereo);
    expect("skip" in t).toBe(false);
    if ("skip" in t) return;
    expect(t.product).toBe("voo");
    expect(t.value).toBe(23570);
    expect(t.legs.map((l) => `${l.city} ${l.date}`)).toEqual([
      "Dubai 2026-11-27",
      "Bangkok 2026-11-28",
      "Rio de Janeiro 2026-12-16",
      "Belo Horizonte 2026-12-19",
    ]);
    expect(t.end).toBe("2026-12-19");
  });

  it("hospedagem: cidade + check-in, volta = check-out", () => {
    const t = readTrip({ servico: "Hospedagem", amount: "6000", cidade__hotel_: "Bangkok", data_de_checkin: "2026-12-01", data_de_checkout: "2026-12-15" });
    expect(t).toMatchObject({ product: "hotel", value: 6000, end: "2026-12-15", legs: [{ city: "Bangkok", date: "2026-12-01" }] });
  });

  it("seguro: destino + vigência", () => {
    const t = readTrip({ servico: "Seguro Viagem", amount: "600", destino__seguro_: "Bangkok", data_de_inicio_da_viagem: "2026-11-27", data_de_termino_da_viagem__seguro_: "2026-12-19" });
    expect(t).toMatchObject({ product: "seguro", value: 600, end: "2026-12-19" });
  });

  it("serviço sem comissão, sem valor ou sem roteiro: ignorado com motivo", () => {
    expect(readTrip({ ...aereo, servico: "Transfer" })).toEqual({ skip: 'serviço "Transfer" não gera comissão' });
    expect(readTrip({ ...aereo, amount: "" })).toEqual({ skip: "valor do negócio vazio" });
    expect(readTrip({ servico: "Passagem Aérea", amount: "100" })).toMatchObject({ skip: expect.stringContaining("sem destino") });
  });
});

describe("conversões do negócio", () => {
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

  it("mapDeal: agência, fechamento e valor na coluna do produto", () => {
    const cfg = hubspotConfig({ HUBSPOT_TOKEN: "x" })!;
    expect(cfg.wonStages).toEqual(["135525686"]);
    const r = mapDeal({ id: "61129597452", properties: aereo }, cfg);
    expect(r).toMatchObject({
      row: { hubspot_id: "61129597452", afiliado: "JT Viajar e Correr", closed_on: "2026-07-20", voo: 23570, hotel: 0, seguro: 0, end_date: "2026-12-19" },
    });
  });

  it("mapDeal: sem agência parceira é ignorado", () => {
    const cfg = hubspotConfig({ HUBSPOT_TOKEN: "x" })!;
    expect(mapDeal({ id: "1", properties: { ...aereo, agencia_parceira: "" } }, cfg)).toEqual({ skip: "sem agência parceira" });
  });

  it("sem token, a integração fica desligada", () => {
    expect(hubspotConfig({})).toBeNull();
  });
});
