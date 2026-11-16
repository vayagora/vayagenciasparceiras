import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { airportShort, paymentMethods, phoneVariants, readDetails, readLegsAny, toTime } from "./hubspot";
import { airportPlace, hubspotConfig, matchPartner, money, normalizeCity, pickAgency, pickTitular, readTrip, searchWonDealsInWindow, toIsoDate, type Association } from "./hubspot";
import { clientHubspotStatus, linkContact, mapDeal, matchesSomeExpedition, planPassengers, type StatusDeal } from "./sync";
import type { Expedition } from "./types";

const a = (contactId: string, order: number, labels: string[] = []): Association => ({ contactId, order, labels });

describe("titular do negócio (rótulo de associação)", () => {
  it("usa o contato com o rótulo 'Titular'", () => {
    expect(pickTitular([a("1", 0), a("2", 1, ["Titular"])], "Titular")).toEqual({ titularId: "2", labeled: true });
  });

  it("aceita vários rótulos de titular ('Titular' ou 'Comprador') e prefere quem viaja", () => {
    const as = [a("1", 0, ["Comprador"]), a("2", 1, ["Comprador", "Passageiro"])];
    expect(pickTitular(as, ["Titular", "Comprador"])).toEqual({ titularId: "2", labeled: true });
  });

  it("negócio com um contato só não precisa de rótulo", () => {
    expect(pickTitular([a("9", 0)], ["Titular"])).toEqual({ titularId: "9", labeled: true });
  });

  it("planPassengers: Comprador e Passageiro viram is_buyer/is_passenger; sem rótulo de passageiro, todos viajam", () => {
    const contacts = new Map([["1", { id: "1", name: "Pai", email: "", phone: "" }], ["2", { id: "2", name: "Filha", email: "", phone: "" }]]);
    const labels = { titular: ["Titular", "Comprador"], buyer: "Comprador", passenger: "Passageiro" };
    const p = planPassengers([a("1", 0, ["Comprador"]), a("2", 1, ["Passageiro"])], contacts, new Map(), labels, "2026-11-01T00:00:00Z");
    expect(p.rows.map((r) => [r.name, r.is_buyer, r.is_passenger, r.is_titular])).toEqual([
      ["Pai", true, false, true],
      ["Filha", false, true, false],
    ]);
    const semRotulo = planPassengers([a("1", 0), a("2", 1)], contacts, new Map(), labels, "2026-11-01T00:00:00Z");
    expect(semRotulo.rows.every((r) => r.is_passenger)).toBe(true);
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
  origem_do_negocio: "Afiliado",
  aeroporto_de_partida: "DXB – Dubai, United Arab Emirates – Intl,",
  data_da_volta_: "2026-11-27",
  aeroporto_de_chegada___trecho_2: "BKK – Bangkok, Thailand – Bangkok Intl Airport,",
  data_de_chegada___trecho_2: "2026-11-28",
  destino___trecho_3: "GIG – RJ, Brasil – Tom Jobim Intl,",
  data_da_ida_: "2026-12-16",
  destino___trecho_4: "CNF – Belo Horizonte, Brasil – Tancredo Neves,",
  data_da_partida___trecho_2: "2026-12-19",
};

describe("agência do negócio (empresa associada)", () => {
  const parceiros = ["JT Viajar e Correr", "Horizonte Eventos"];
  it("usa a empresa que é parceira, com o nome como está no sistema", () => {
    expect(pickAgency(["Vay Agora", "jt viajar e correr"], parceiros)).toBe("JT Viajar e Correr");
  });
  it("empresa que não é parceira: devolve o nome dela (entra sinalizado)", () => {
    expect(pickAgency(["Outra Agência"], parceiros)).toBe("Outra Agência");
  });
  it("sem empresa associada: null", () => {
    expect(pickAgency([], parceiros)).toBeNull();
  });
  it("matchPartner só aceita parceiro cadastrado", () => {
    expect(matchPartner(["Outra Agência"], parceiros)).toBeNull();
    expect(matchPartner(["Outra", "JT VIAJAR E CORRER"], parceiros)).toBe("JT Viajar e Correr");
  });
});

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

  it("config padrão: Emissão Realizada + origem Afiliado", () => {
    const cfg = hubspotConfig({ HUBSPOT_TOKEN: "x" })!;
    expect(cfg.wonStages).toEqual(["135525686"]);
    expect([cfg.origemProp, cfg.origemValue]).toEqual(["origem_do_negocio", "Afiliado"]);
  });

  it("mapDeal: agência, fechamento e valor na coluna do produto", () => {
    const r = mapDeal({ id: "61129597452", properties: aereo }, "JT Viajar e Correr");
    expect(r).toMatchObject({
      row: { hubspot_id: "61129597452", afiliado: "JT Viajar e Correr", closed_on: "2026-07-20", voo: 23570, hotel: 0, seguro: 0, end_date: "2026-12-19" },
    });
  });

  it("forma de pagamento: várias opções separadas por ';'", () => {
    expect(paymentMethods("Pix/Ted/Doc;Crédito na VAY")).toEqual(["Pix/Ted/Doc", "Crédito na VAY"]);
    expect(paymentMethods(null)).toEqual([]);
    const r = mapDeal({ id: "1", properties: { ...aereo, forma_de_pagamento: "Crédito na VAY" } }, "JT Viajar e Correr");
    expect(r).toMatchObject({ row: { payment_methods: ["Crédito na VAY"] } });
  });

  it("mapDeal: sem empresa associada é ignorado", () => {
    expect(mapDeal({ id: "1", properties: aereo }, null)).toEqual({ skip: "sem empresa (agência) associada" });
  });

  it("sem token, a integração fica desligada", () => {
    expect(hubspotConfig({})).toBeNull();
  });
});

describe("negócios não sinalizados", () => {
  const bkk: Expedition = { id: "e1", partner_id: "pJT", name: "Tailândia", city: "Bangkok", start_date: "2026-12-01", days: 15, arrival_airport: null, departure_airport: null, created_at: "" };
  const lisboa: Expedition = { ...bkk, id: "e2", partner_id: "pX", city: "Lisboa" };
  const ids = new Map([["JT Viajar e Correr", "pJT"]]);

  it("mapDeal: guarda nome, origem e agência; afiliado vazio (o parceiro não vê)", () => {
    const r = mapDeal({ id: "9", properties: { ...aereo, dealname: "P-Baroni", origem_do_negocio: "Passivo [ação do contato]" } }, null, {
      signaled: false,
      hsAgency: "",
    });
    expect(r).toMatchObject({ row: { signaled: false, afiliado: "", name: "P-Baroni", hs_origem: "Passivo [ação do contato]", voo: 23570 } });
  });

  it("só guarda se combinar com alguma expedição (do parceiro da empresa, se houver)", () => {
    const m = mapDeal({ id: "9", properties: aereo }, null, { signaled: false });
    if ("skip" in m) throw new Error(m.skip);
    expect(matchesSomeExpedition(m.row, [bkk], ids)).toBe(true);
    expect(matchesSomeExpedition(m.row, [lisboa], ids)).toBe(false);
    expect(matchesSomeExpedition({ ...m.row, hs_agency: "JT Viajar e Correr" }, [{ ...bkk, partner_id: "pX" }], ids)).toBe(false);
  });
});

describe("busca por janela de datas", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("procura negócios ganhos pelo 1º trecho, check-in ou início do seguro", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await searchWonDealsInWindow(hubspotConfig({ HUBSPOT_TOKEN: "x" })!, "2026-11-01", "2026-12-18");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.filterGroups.map((g: { filters: { propertyName: string }[] }) => g.filters[1].propertyName)).toEqual([
      "data_da_volta_",
      "data_de_checkin",
      "data_de_inicio_da_viagem",
    ]);
    expect(body.filterGroups[0].filters[1]).toMatchObject({ operator: "BETWEEN", value: String(Date.UTC(2026, 10, 1)), highValue: String(Date.UTC(2026, 11, 18)) });
    expect(body.filterGroups[0].filters[0]).toMatchObject({ propertyName: "dealstage", values: ["135525686"] });
  });
});

describe("detalhes do produto para o modal", () => {
  it("voo: trechos com origem, destino, horários e companhia, em ordem de data", () => {
    const det = readDetails(
      {
        ...aereo,
        aeroporto_de_destino: "CNF – Belo Horizonte, Brasil – Tancredo Neves,",
        hora_descolagem_ida: "22:10",
        hora_chegada_volta: "06:05",
        companhia_aerea_ida: "Emirates",
      },
      "voo",
    );
    expect(det.voo?.segments[0]).toEqual({ from: "CNF · Belo Horizonte", to: "DXB · Dubai", date: "2026-11-27", dep: "22:10", arr: "06:05", airline: "Emirates" });
    expect(det.voo?.segments.map((s) => s.date)).toEqual(["2026-11-27", "2026-11-28", "2026-12-16", "2026-12-19"]);
  });
  it("hospedagem e seguro", () => {
    expect(readDetails({ fornecedor__hotel_: "Hotel X", cidade__hotel_: "Bangkok", data_de_checkin: "2026-12-01" }, "hotel").hotel).toMatchObject({ name: "Hotel X", city: "Bangkok", checkin: "2026-12-01" });
    expect(readDetails({ nome_do_plano__seguro_: "GTA 60", data_de_inicio_da_viagem: "2026-11-27" }, "seguro").seguro).toMatchObject({ plan: "GTA 60", start: "2026-11-27" });
  });
  it("aeroporto curto e horários", () => {
    expect(airportShort("BKK – Bangkok, Thailand – Bangkok Intl Airport,")).toBe("BKK · Bangkok");
    expect(airportShort("")).toBe("");
    expect(toTime("10:30:00")).toBe("10:30");
    expect(toTime("")).toBe("");
  });
});

describe("etapa do cliente pelo HubSpot", () => {
  const exp: Expedition = { id: "e1", partner_id: "p", name: "Tailândia", city: "Tailândia", start_date: "2026-12-01", days: 15, arrival_airport: "BKK", departure_airport: null, created_at: "" };
  const legs = [{ city: "Bangkok", date: "2026-11-30", lat: 13.68, lng: 100.75 }];
  const baroni = { name: "Baroni Henrique de Paula Frontzek", email: "", phone: "+55 (31) 99327-2968", hubspot_contact_id: null };
  const person = { contactId: "242743641764", name: "Baroni Henrique de Paula Frontzek", email: "baroni@x.com", phone: "+5531993272968" };
  const d = (id: string, kind: StatusDeal["kind"], over: Partial<StatusDeal> = {}): StatusDeal => ({ id, kind, legs, end_date: "2026-12-16", people: [person], ...over });

  it("negócio ganho compatível → compra concluída (prevalece sobre o em aberto)", () => {
    expect(clientHubspotStatus(baroni, exp, [d("1", "open"), d("2", "won")])).toMatchObject({ status: "fechado", dealId: "2" });
  });
  it("traz as observações dos negócios do cliente (ganho primeiro, sem repetir)", () => {
    const r = clientHubspotStatus(baroni, exp, [d("1", "open", { note: "Cotando assento" }), d("2", "won", { note: "Emitido, bagagem inclusa" }), d("3", "open", { note: "Cotando assento" })]);
    expect(r.note).toBe("Emitido, bagagem inclusa\n\nCotando assento");
    expect(clientHubspotStatus(baroni, exp, []).note).toBe("");
  });

  it("só em aberto → em negociação", () => {
    expect(clientHubspotStatus(baroni, exp, [d("1", "open")])).toMatchObject({ status: "negociacao", dealId: "1" });
  });
  it("negócio de outro destino ou de outra pessoa não conta", () => {
    const paris = [{ city: "Paris", date: "2026-08-01", lat: 49, lng: 2.5 }];
    expect(clientHubspotStatus(baroni, exp, [d("1", "won", { legs: paris, end_date: "2026-08-10" })]).status).toBeNull();
    expect(clientHubspotStatus(baroni, exp, [d("1", "won", { people: [{ ...person, contactId: "9", name: "Outra Pessoa", phone: "" }] })]).status).toBeNull();
  });
  it("liga o cliente ao contato por e-mail ou, sem e-mail, por telefone", () => {
    const people = [{ id: "7", email: "ana@x.com", phones: [], name: "Ana" }, { id: "8", email: "", phones: ["+5531993272968"], name: "Baroni" }];
    expect(linkContact({ ...baroni, email: "ANA@x.com" }, people)?.id).toBe("7");
    expect(linkContact(baroni, people)?.id).toBe("8");
    expect(linkContact({ ...baroni, phone: "" }, people)).toBeUndefined();
  });
  it("variações de telefone para a busca", () => {
    expect(phoneVariants("+55 (31) 99327-2968")).toEqual(expect.arrayContaining(["+5531993272968", "31993272968"]));
    expect(phoneVariants("123")).toEqual([]);
  });
  it("negócio em aberto sem serviço/valor: o roteiro ainda é lido", () => {
    expect(readLegsAny({ aeroporto_de_partida: "BKK – Bangkok, Thailand – Bangkok Intl Airport,", data_da_volta_: "2026-11-30" })?.legs[0].city).toBe("Bangkok");
  });
});
