import { describe, expect, it } from "vitest";
import { Ledger } from "./ledger";
import { calculatedCashback, dealNo, hubspotFixes, matchExpedition, resolveDeals, samePerson, sameName } from "./matching";
import { bestStage, dealStage, paymentKind } from "./commission";
import type { Deal, Expedition, Partner, Passenger } from "./types";

// ---------------------------------------------------------------- Fixtures

const partner: Partner = { id: "pA", name: "Horizonte Eventos", afiliado: "Horizonte Eventos", contact_email: null, created_at: "" };
const madrid: Expedition = { id: "eMad", partner_id: "pA", name: "Congresso de Cardiologia", city: "Madrid", start_date: "2026-11-13", days: 6, arrival_airport: null, departure_airport: null, created_at: "" };

let seq = 1;
function pax(name: string, opts: Partial<Passenger> = {}): Passenger {
  const email = `${name.toLowerCase()}@email.com`;
  return { id: `px-${name}-${seq++}`, deal_id: "", hubspot_contact_id: `hs-${name}`, name, email, phone: "", is_titular: false, is_buyer: false, is_passenger: true, first_seen_at: "", position: 0, ...opts };
}

function deal(over: Partial<Deal> & { passengers?: Passenger[] } = {}): Deal {
  const n = seq++;
  const passengers = (over.passengers ?? [pax("Ana", { is_titular: true })]).map((p, i) => ({ ...p, deal_id: `d${n}`, position: i }));
  return {
    id: `d${n}`,
    hubspot_id: String(1000 + n),
    seq: n,
    name: `Negócio ${n}`,
    hs_stage: "135525686",
    stage_kind: "won",
    partner_note: "",
    signaled: true,
    hs_origem: "Agência Parceira",
    hs_agency: "Horizonte Eventos",
    details: {},
    payment_methods: ["Pix/Ted/Doc"],
    cashback_override: null,
    afiliado: "Horizonte Eventos",
    closed_on: "2026-09-01",
    legs: [{ city: "Madrid", date: "2026-11-12" }],
    end_date: "2026-11-19",
    voo: 8000,
    hotel: 6000,
    seguro: 600,
    override_expedition_id: null,
    override_none: false,
    reviewed: false,
    titular_labeled: true,
    ...over,
    passengers,
    passenger_count: over.passenger_count ?? passengers.length,
  };
}
const open = (over: Partial<Deal> = {}) => deal({ stage_kind: "open", hs_stage: "presentationscheduled", closed_on: null, ...over });

const flagKeys = (r: { flags: { key: string }[] }) => r.flags.map((f) => f.key);

// ---------------------------------------------------------------- Vínculo (SPEC §4.4)

describe("vínculo negócio → expedição (sempre automático)", () => {
  it("cidade exata e chegada 1 dia antes: vínculo exato, sem aviso", () => {
    const [r] = resolveDeals([deal()], [partner], [madrid]);
    expect(r.exp?.id).toBe("eMad");
    expect(r.flags).toEqual([]);
    expect(r.needsReview).toBe(false);
  });

  it("Lisboa 09/11 → Madrid 13/11: vincula por aproximação, só informativo", () => {
    const d = deal({ legs: [{ city: "Lisboa", date: "2026-11-09" }, { city: "Madrid", date: "2026-11-13" }], end_date: "2026-11-20" });
    const [r] = resolveDeals([d], [partner], [madrid]);
    expect(r.exp?.id).toBe("eMad");
    expect(flagKeys(r)).toEqual(["aprox"]);
    expect(r.needsReview).toBe(false);
    expect(r.reason).toContain("4 dias antes");
  });

  it("Paris fora da janela: não vincula, não remunera e pede correção no HubSpot", () => {
    const d = deal({ legs: [{ city: "Paris", date: "2026-08-01" }], end_date: "2026-08-10" });
    const [r] = resolveDeals([d], [partner], [madrid]);
    expect(r.exp).toBeNull();
    expect(r.com.total).toBe(0);
    expect(flagKeys(r)).toEqual(["nenhuma"]);
    expect(r.needsReview).toBe(true);
  });

  it("duas expedições compatíveis: fica na de maior pontuação; aviso só informativo", () => {
    const barcelona: Expedition = { ...madrid, id: "eBcn", name: "Feira", city: "Barcelona", start_date: "2026-11-12" };
    const [r] = resolveDeals([deal()], [partner], [barcelona, madrid]);
    expect(r.exp?.id).toBe("eMad");
    expect(r.candIds).toEqual(["eMad", "eBcn"]);
    expect(flagKeys(r)).toContain("multi");
    expect(r.needsReview).toBe(false);
  });

  it("ajuste manual antigo no sistema é ignorado: o vínculo só muda pelo HubSpot", () => {
    const [r] = resolveDeals([deal({ override_none: true })], [partner], [madrid]);
    expect(r.exp?.id).toBe("eMad");
  });

  it("roteiro real do HubSpot (Dubai → Bangkok → Rio → BH) vincula à expedição de Bangkok", () => {
    const bangkok: Expedition = { ...madrid, id: "eBkk", city: "Bangkok", start_date: "2026-12-01", days: 15 };
    const d = deal({
      legs: [
        { city: "Dubai", date: "2026-11-27", lat: 25.25, lng: 55.36 },
        { city: "Bangkok", date: "2026-11-28", lat: 13.75, lng: 100.5 },
        { city: "Rio de Janeiro", date: "2026-12-16" },
        { city: "Belo Horizonte", date: "2026-12-19" },
      ],
      end_date: "2026-12-19",
      voo: 23570, hotel: 0, seguro: 0,
    });
    const [r] = resolveDeals([d], [partner], [madrid, bangkok]);
    expect(r.exp?.id).toBe("eBkk");
    expect(r.com.total).toBeCloseTo(707.1); // 3% de R$ 23.570
  });

  it("caso Claudia: chega em Palma 06/10, volta 18/10 → Maiorca 08/10 (aproximado); não casa com Puglia nem Algarve", () => {
    const bici: Partner = { ...partner, id: "pBici", name: "Bicitrip", afiliado: "Bicitrip" };
    const exp = (id: string, city: string, ap: string, start: string): Expedition => ({ ...madrid, id, partner_id: "pBici", name: id, city, arrival_airport: ap, start_date: start, days: 6 });
    const exps = [exp("Puglia 05/10", "Puglia, Itália", "BRI", "2027-10-05"), exp("Maiorca 08/10", "Maiorca, Espanha", "PMI", "2027-10-08"), exp("Puglia 12/10", "Puglia, Itália", "BRI", "2027-10-12"), exp("Algarve 17/10", "Algarve, Portugal", "FAO", "2027-10-17")];
    const d = open({
      afiliado: "Bicitrip",
      legs: [{ city: "Palma Mallorca", date: "2027-10-06", lat: 39.5517, lng: 2.7388 }, { city: "São Paulo", date: "2027-10-18" }],
      end_date: "2027-10-18",
      voo: 0, hotel: 0, seguro: 0,
    });
    const [r] = resolveDeals([d], [bici], exps);
    expect(r.exp?.id).toBe("Maiorca 08/10");
    expect(r.candIds).toEqual(["Maiorca 08/10"]);
    expect(flagKeys(r)).toEqual(["aprox"]);
  });

  it("matchExpedition (usado na sincronização): a de maior pontuação, ou nenhuma", () => {
    const barcelona: Expedition = { ...madrid, id: "eBcn", city: "Barcelona", start_date: "2026-11-12" };
    expect(matchExpedition(deal(), [barcelona, madrid])?.id).toBe("eMad");
    expect(matchExpedition(deal({ legs: [{ city: "Paris", date: "2026-08-01" }], end_date: "2026-08-10" }), [madrid])).toBeNull();
  });

  it("comissão 3% / 3% / 5% sobre o valor do negócio (acordo, item 4.1)", () => {
    const [r] = resolveDeals([deal()], [partner], [madrid]);
    expect(r.com.voo).toBeCloseTo(240);
    expect(r.com.hotel).toBeCloseTo(180);
    expect(r.com.seguro).toBeCloseTo(30);
    expect(r.com.total).toBeCloseTo(450);
  });
});

// ---------------------------------------------------------------- Etapa pelo HubSpot (SPEC 2.0)

describe("etapa do cliente pela etapa do negócio", () => {
  it("Pré Cotação/Realizar Cotação → em contato; demais em aberto → em negociação; ganho → compra concluída; perdido → não comprou", () => {
    expect(dealStage({ stage_kind: "open", hs_stage: "appointmentscheduled" })).toBe("em_contato");
    expect(dealStage({ stage_kind: "open", hs_stage: "qualifiedtobuy" })).toBe("em_contato");
    expect(dealStage({ stage_kind: "open", hs_stage: "presentationscheduled" })).toBe("negociacao");
    expect(dealStage({ stage_kind: "open", hs_stage: "contractsent" })).toBe("negociacao");
    expect(dealStage({ stage_kind: "won", hs_stage: "135525686" })).toBe("fechado");
    expect(dealStage({ stage_kind: "lost", hs_stage: "closedlost" })).toBe("perdido");
  });

  it("vários negócios: vale a etapa mais avançada", () => {
    expect(bestStage(["perdido", "em_contato", "fechado"])).toBe("fechado");
    expect(bestStage(["perdido", "negociacao"])).toBe("negociacao");
    expect(bestStage(["perdido"])).toBe("perdido");
  });

  it("negócio em aberto entra na lista da expedição, mas não remunera", () => {
    const l = new Ledger([open()], [partner], [madrid]);
    const [line] = l.lines(madrid);
    expect(line.name).toBe("Ana");
    expect(line.stage).toBe("negociacao");
    expect(line.com.total).toBe(0);
    expect(l.paid).toEqual([]);
    expect(l.expStats(madrid)).toMatchObject({ n: 1, closed: 0, deals: 0, total: 0 });
  });

  it("negócio perdido também aparece (não comprou) e não gera pendência sem expedição", () => {
    const l = new Ledger([deal({ stage_kind: "lost", hs_stage: "closedlost", closed_on: null })], [partner], [madrid]);
    expect(l.lines(madrid)[0].stage).toBe("perdido");
    const away = resolveDeals([deal({ stage_kind: "lost", legs: [{ city: "Paris", date: "2026-08-01" }], end_date: "2026-08-10" })], [partner], [madrid])[0];
    expect(away.needsReview).toBe(false);
  });

  it("perdido e depois comprado (dois negócios): compra concluída", () => {
    const ana = pax("Ana", { is_titular: true });
    const l = new Ledger([deal({ stage_kind: "lost", passengers: [ana] }), deal({ passengers: [ana] })], [partner], [madrid]);
    const [line] = l.lines(madrid);
    expect(line.stage).toBe("fechado");
    expect(line.deals.length).toBe(2);
    expect(line.com.total).toBeCloseTo(450);
  });

  it("observação para o parceiro vem do negócio no HubSpot", () => {
    const l = new Ledger([open({ partner_note: "Cotando assento" })], [partner], [madrid]);
    expect(l.lines(madrid)[0].note).toBe("Cotando assento");
  });
});

// ---------------------------------------------------------------- Lista de clientes pelos passageiros

describe("lista de clientes = passageiros dos negócios", () => {
  const casal = () =>
    deal({ passengers: [pax("Emerson", { is_titular: true }), pax("Gislaine")], voo: 15000, hotel: 0, seguro: 0 });

  it("negócio da agência com 2 passageiros não vai para a lista: os dois vão para A conferir e não remunera", () => {
    const l = new Ledger([casal()], [partner], [madrid]);
    expect(l.lines(madrid)).toEqual([]);
    expect(l.paid).toEqual([]);
    const q = l.reviewQueue(madrid);
    expect(q.pending.map((p) => [p.name, p.reasons])).toEqual([["Emerson", ["varios"]], ["Gislaine", ["varios"]]]);
    expect(l.pendingFor(madrid)).toBe(2);
  });

  it("separado no HubSpot (um negócio por passageiro): os dois vão direto para Passageiros", () => {
    const em = pax("Emerson", { is_titular: true });
    const gi = pax("Gislaine", { is_titular: true });
    const l = new Ledger([deal({ passengers: [em], voo: 7500, hotel: 0, seguro: 0 }), deal({ passengers: [gi], voo: 7500, hotel: 0, seguro: 0 })], [partner], [madrid]);
    expect(l.lines(madrid).map((x) => [x.name, x.com.total])).toEqual([["Emerson", 225], ["Gislaine", 225]]);
    expect(l.pendingFor(madrid)).toBe(0);
    expect(l.expStats(madrid)).toMatchObject({ n: 2, closed: 2, deals: 2, total: 450 });
  });

  it("conferido pela Vay: sai de A conferir, vai para Conferidos e não volta", () => {
    const review = { id: "r1", expedition_id: "eMad", person_key: "c:hs-Gislaine", person_name: "Gislaine", reviewed_by_name: "Ana", reviewed_at: "2026-11-19T12:00:00Z" };
    const l = new Ledger([casal()], [partner], [madrid], [review]);
    const q = l.reviewQueue(madrid);
    expect(q.pending.map((p) => p.name)).toEqual(["Emerson"]);
    expect(q.done.map((p) => [p.name, p.review?.reviewed_by_name])).toEqual([["Gislaine", "Ana"]]);
    // marcação de outra expedição não vale aqui
    const other = new Ledger([casal()], [partner], [madrid], [{ ...review, expedition_id: "outra" }]);
    expect(other.pendingFor(madrid)).toBe(2);
  });

  it("quem já está em Passageiros não volta para A conferir por outro negócio", () => {
    const em = pax("Emerson", { is_titular: true });
    const l = new Ledger([deal({ passengers: [em] }), deal({ passengers: [em, pax("Gislaine")] })], [partner], [madrid]);
    expect(l.lines(madrid).map((x) => x.name)).toEqual(["Emerson"]);
    expect(l.reviewQueue(madrid).pending.map((p) => p.name)).toEqual(["Gislaine"]);
  });

  it("a mesma pessoa em dois negócios (voo e seguro): uma linha, valores somados", () => {
    const ana = pax("Ana", { is_titular: true });
    const l = new Ledger([deal({ passengers: [ana], hotel: 0, seguro: 0 }), deal({ passengers: [ana], voo: 0, hotel: 0, seguro: 600 })], [partner], [madrid]);
    const lines = l.lines(madrid);
    expect(lines.length).toBe(1);
    expect(lines[0].deals.length).toBe(2);
    expect(lines[0].values).toEqual({ voo: 8000, hotel: 0, seguro: 600 });
    expect(lines[0].com.total).toBeCloseTo(270);
  });

  it("sem contato do HubSpot, a mesma pessoa é reconhecida pelo nome completo", () => {
    const a = pax("Ana Ribeiro", { hubspot_contact_id: null, is_titular: true });
    const b = pax("ANA  RIBEIRO", { hubspot_contact_id: null, is_titular: true });
    const l = new Ledger([deal({ passengers: [a] }), open({ passengers: [b] })], [partner], [madrid]);
    expect(l.lines(madrid).length).toBe(1);
  });

  it("comprador que não viaja não entra na lista; quem viajou mostra 'comprado por'", () => {
    const pai = pax("Pai Comprador", { is_titular: true, is_buyer: true, is_passenger: false });
    const filha = pax("Filha Viajante");
    const l = new Ledger([deal({ passengers: [pai, filha] })], [partner], [madrid]);
    const lines = l.lines(madrid);
    expect(lines.map((x) => x.name)).toEqual(["Filha Viajante"]);
    expect(lines[0].boughtBy).toEqual(["Pai Comprador"]);
    expect(lines[0].com.total).toBeCloseTo(450); // linha principal: o primeiro que viaja
  });

  it("ordem: compra concluída primeiro, depois negociação, contato e não comprou", () => {
    const l = new Ledger(
      [
        deal({ stage_kind: "lost", passengers: [pax("Zé", { is_titular: true })] }),
        open({ hs_stage: "appointmentscheduled", passengers: [pax("Bia", { is_titular: true })] }),
        deal({ passengers: [pax("Caio", { is_titular: true })] }),
      ],
      [partner],
      [madrid],
    );
    expect(l.lines(madrid).map((x) => [x.name, x.stage])).toEqual([["Caio", "fechado"], ["Bia", "em_contato"], ["Zé", "perdido"]]);
  });
});

// ---------------------------------------------------------------- Não sinalizados

describe("negócios não sinalizados no HubSpot", () => {
  const atlas: Partner = { ...partner, id: "pB", name: "Grupo Atlas", afiliado: "Grupo Atlas" };
  const gramado: Expedition = { ...madrid, id: "eGra", partner_id: "pB", city: "Gramado", start_date: "2026-12-03", days: 4 };
  const naoSinalizado = (over: Partial<Deal> = {}) =>
    deal({ signaled: false, afiliado: "", hs_origem: "Passivo [ação do contato]", hs_agency: "", ...over });

  it("destino e data compatíveis: pendência, não remunera, não entra na lista e diz o que corrigir", () => {
    const l = new Ledger([naoSinalizado()], [partner], [madrid]);
    const r = l.resolved[0];
    expect(r.exp).toBeNull();
    expect(r.suggested?.id).toBe("eMad");
    expect(r.com.total).toBe(0);
    expect(r.potential.total).toBeCloseTo(450);
    expect(r.fixes).toEqual([
      'marcar "Origem do Negócio" como "Agências Parceiras" (hoje: Passivo [ação do contato])',
      'associar a empresa "Horizonte Eventos" ao negócio',
    ]);
    expect(l.lines(madrid)).toEqual([]);
    expect(l.paid).toEqual([]);
    expect(l.pendingFor(madrid)).toBe(1);
    expect(l.reviewQueue(madrid).pending.map((p) => [p.name, p.reasons])).toEqual([["Ana", ["nao_sinalizado"]]]);
  });

  it("em aberto e não sinalizado (caso Claudia): também aponta, sem comissão potencial", () => {
    const [r] = resolveDeals([naoSinalizado({ stage_kind: "open", hs_origem: "Agências Parceiras" })], [partner], [madrid]);
    expect(r.suggested?.id).toBe("eMad");
    expect(r.potential.total).toBe(0);
    expect(r.fixes).toEqual(['associar a empresa "Horizonte Eventos" ao negócio']);
  });

  it("só 'Agências Parceiras' conta; 'Afiliado' (método antigo) pede a troca da origem (caso Eliandro)", () => {
    expect(hubspotFixes({ hs_origem: "Agências Parceiras", hs_agency: "X" }, "X")).toEqual([]);
    expect(hubspotFixes({ hs_origem: "Afiliado", hs_agency: "X" }, "X")).toEqual(['marcar "Origem do Negócio" como "Agências Parceiras" (hoje: Afiliado)']);
    const l = new Ledger([naoSinalizado({ hs_origem: "Afiliado", hs_agency: "Horizonte Eventos" })], [partner], [madrid]);
    expect(l.lines(madrid)).toEqual([]);
    expect(l.reviewQueue(madrid).pending.map((p) => p.reasons)).toEqual([["nao_sinalizado"]]);
  });

  it("empresa da agência associada, mas origem errada: só pede a origem e fica no parceiro certo", () => {
    const d = naoSinalizado({ hs_agency: "Grupo Atlas", legs: [{ city: "Gramado", date: "2026-12-03" }], end_date: "2026-12-06" });
    const [r] = resolveDeals([d], [partner, atlas], [madrid, gramado]);
    expect(r.suggested?.id).toBe("eGra");
    expect(r.fixes).toEqual(['marcar "Origem do Negócio" como "Agências Parceiras" (hoje: Passivo [ação do contato])']);
  });

  it("sem expedição compatível: ignorado, sem pendência", () => {
    const l = new Ledger([naoSinalizado({ legs: [{ city: "Paris", date: "2026-08-01" }], end_date: "2026-08-10" })], [partner], [madrid]);
    expect(l.resolved[0].needsReview).toBe(false);
    expect(l.pendingFor(madrid)).toBe(0);
  });

  it("marcação 'conferido' antiga não esconde a pendência: só some corrigindo no HubSpot", () => {
    const l = new Ledger([naoSinalizado({ reviewed: true })], [partner], [madrid]);
    expect(l.pendingFor(madrid)).toBe(1);
  });
});

describe("expedição com destino livre e aeroporto de chegada", () => {
  const tailandia: Expedition = { ...madrid, id: "eTh", city: "Tailândia", arrival_airport: "BKK", start_date: "2026-12-01", days: 15 };

  it("trecho em Bangkok (aeroporto BKK) conta como o destino", () => {
    const d = deal({ legs: [{ city: "Bangkok", date: "2026-11-30", lat: 13.68, lng: 100.75 }], end_date: "2026-12-16" });
    const [r] = resolveDeals([d], [partner], [tailandia]);
    expect(r.exp?.id).toBe("eTh");
    expect(r.reason).toContain("Tailândia está no roteiro");
  });

  it("Phuket fica a ~690 km: vincula por aproximação", () => {
    const d = deal({ legs: [{ city: "Phuket", date: "2026-11-30", lat: 8.11, lng: 98.32 }], end_date: "2026-12-16" });
    expect(flagKeys(resolveDeals([d], [partner], [tailandia])[0])).toContain("aprox");
  });

  it("sem aeroporto e com destino fora da lista de cidades: não há como vincular", () => {
    const d = deal({ legs: [{ city: "Bangkok", date: "2026-11-30", lat: 13.68, lng: 100.75 }], end_date: "2026-12-16" });
    expect(resolveDeals([d], [partner], [{ ...tailandia, arrival_airport: null }])[0].exp).toBeNull();
  });
});

describe("forma de pagamento e cashback", () => {
  const resolve = (over: Partial<Deal>) => new Ledger([deal(over)], [partner], [madrid]);

  it("pago com dinheiro (cartão, Pix…): cashback normal", () => {
    const l = resolve({ payment_methods: ["Pagar.me"] });
    expect(l.resolved[0].com.total).toBeCloseTo(450);
    expect(l.resolved[0].flags).toEqual([]);
  });

  it("100% Crédito na VAY: sem cashback, sem pendência", () => {
    const r = resolve({ payment_methods: ["Crédito na VAY"] }).resolved[0];
    expect(r.com.total).toBe(0);
    expect(r.com.sold).toBe(14600);
    expect(flagKeys(r)).toEqual(["credito"]);
    expect(r.needsReview).toBe(false);
  });

  it("pagamento misto: cashback a definir (R$ 0), sem pendência por enquanto", () => {
    const l = resolve({ payment_methods: ["Crédito na VAY", "Pix/Ted/Doc"] });
    expect(l.resolved[0].com.total).toBe(0);
    expect(flagKeys(l.resolved[0])).toEqual(["misto"]);
    expect(l.pendingFor(madrid)).toBe(0);
  });

  it("valor definido antes (legado) continua valendo", () => {
    const r = resolve({ payment_methods: ["Crédito na VAY", "Pix/Ted/Doc"], cashback_override: 200 }).resolved[0];
    expect(r.com.total).toBe(200);
    expect(r.com.voo).toBeCloseTo((240 / 450) * 200);
    expect(calculatedCashback(deal({ cashback_override: 10 }))).toBeCloseTo(450);
  });

  it("forma de pagamento", () => {
    expect(paymentKind([])).toBe("dinheiro");
    expect(paymentKind(["crédito na vay"])).toBe("credito");
    expect(paymentKind(["Crédito na VAY", "Boleto"])).toBe("misto");
  });
});

describe("cliente recorrente (SPEC 1.3)", () => {
  it("o mesmo cliente em duas expedições da agência: as duas compras remuneram", () => {
    const lisboa: Expedition = { ...madrid, id: "eLis", city: "Lisboa", start_date: "2027-05-10", days: 5 };
    const d2 = deal({ legs: [{ city: "Lisboa", date: "2027-05-09" }], end_date: "2027-05-15" });
    const l = new Ledger([deal(), d2], [partner], [madrid, lisboa]);
    expect(l.paid.map((r) => r.exp?.id).sort()).toEqual(["eLis", "eMad"]);
  });
});

describe("identificação de pessoas", () => {
  it("ID do HubSpot prevalece sobre e-mail; sem ID, e-mail; sem e-mail, telefone", () => {
    expect(samePerson({ hubspot_contact_id: "1", email: "a@x.com" }, { hubspot_contact_id: "2", email: "a@x.com" })).toBe(false);
    expect(samePerson({ email: "Ana@X.com" }, { hubspot_contact_id: "9", email: "ana@x.com " })).toBe(true);
    expect(samePerson({ phone: "(51) 99999-0000" }, { phone: "+55 51 99999-0000" })).toBe(true);
  });
  it("nome completo ignora acentos e de/da/do; só o primeiro nome não basta", () => {
    expect(sameName("Gabriela Tolentino de Almeida", "GABRIELA TOLENTINO ALMEIDA")).toBe(true);
    expect(sameName("Ana", "Ana")).toBe(false);
  });
  it("número do negócio", () => {
    expect(dealNo({ hubspot_id: "123", seq: 4 })).toBe("#123");
  });
});
