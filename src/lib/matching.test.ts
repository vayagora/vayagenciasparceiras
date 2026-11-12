import { describe, expect, it } from "vitest";
import { Ledger, shownStage } from "./ledger";
import { dealNo, resolveDeals, samePerson } from "./matching";
import type { Client, Deal, Expedition, Partner, Passenger } from "./types";

// ---------------------------------------------------------------- Fixtures

const partner: Partner = { id: "pA", name: "Horizonte Eventos", afiliado: "Horizonte Eventos", contact_email: null, created_at: "" };
const madrid: Expedition = { id: "eMad", partner_id: "pA", name: "Congresso de Cardiologia", city: "Madrid", start_date: "2026-11-13", days: 6, arrival_airport: null, departure_airport: null, created_at: "" };

let seq = 1;
function pax(name: string, opts: Partial<Passenger> = {}): Passenger {
  const email = `${name.toLowerCase()}@email.com`;
  return { id: `px-${name}-${seq++}`, deal_id: "", hubspot_contact_id: null, name, email, phone: "", is_titular: false, first_seen_at: "", position: 0, ...opts };
}

function deal(over: Partial<Deal> & { passengers?: Passenger[] } = {}): Deal {
  const n = seq++;
  const passengers = (over.passengers ?? [pax("Ana", { is_titular: true })]).map((p, i) => ({ ...p, deal_id: `d${n}`, position: i }));
  return {
    id: `d${n}`,
    hubspot_id: null,
    seq: n,
    name: `Negócio ${n}`,
    signaled: true,
    hs_origem: "Afiliado",
    hs_agency: "Horizonte Eventos",
    details: {},
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

function client(name: string, created_at: string, exp = madrid): Client {
  return {
    id: `c-${name}`,
    expedition_id: exp.id,
    name,
    email: `${name.toLowerCase()}@email.com`,
    phone: "",
    stage: "auto",
    hubspot_status: null,
    hubspot_contact_id: null,
    hs_status: null,
    hs_deal_id: null,
    partner_note: "",
    last_follow_up: null,
    note: "",
    created_at,
  };
}

const flagKeys = (r: { flags: { key: string }[] }) => r.flags.map((f) => f.key);

// ---------------------------------------------------------------- Vínculo (SPEC §4.4, §8)

describe("vínculo negócio → expedição", () => {
  const ana = client("Ana", "2026-10-01");

  it("cidade exata e chegada 1 dia antes: vínculo exato, sem sinalização", () => {
    const [r] = resolveDeals([deal()], [partner], [madrid], [ana]);
    expect(r.exp?.id).toBe("eMad");
    expect(r.flags).toEqual([]);
    expect(r.needsReview).toBe(false);
  });

  it("Lisboa 09/11 → Madrid 13/11: vincula por aproximação", () => {
    const d = deal({ legs: [{ city: "Lisboa", date: "2026-11-09" }, { city: "Madrid", date: "2026-11-13" }], end_date: "2026-11-20" });
    const [r] = resolveDeals([d], [partner], [madrid], [ana]);
    expect(r.exp?.id).toBe("eMad");
    expect(flagKeys(r)).toEqual(["aprox"]);
    expect(r.reason).toContain("Madrid está no roteiro");
    expect(r.reason).toContain("4 dias antes");
  });

  it("Barcelona → Madrid: vincula", () => {
    const d = deal({ legs: [{ city: "Barcelona", date: "2026-11-10" }, { city: "Madrid", date: "2026-11-14" }] });
    const [r] = resolveDeals([d], [partner], [madrid], [ana]);
    expect(r.exp?.id).toBe("eMad");
    expect(r.com.total).toBeGreaterThan(0);
  });

  it("Paris fora da janela: não vincula e não remunera", () => {
    const d = deal({ legs: [{ city: "Paris", date: "2026-08-01" }], end_date: "2026-08-10" });
    const [r] = resolveDeals([d], [partner], [madrid], [ana]);
    expect(r.exp).toBeNull();
    expect(r.com.total).toBe(0);
    expect(flagKeys(r)).toEqual(["nenhuma"]);
  });

  it("duas expedições compatíveis: vence a maior pontuação e sinaliza", () => {
    const barcelona: Expedition = { ...madrid, id: "eBcn", name: "Feira", city: "Barcelona", start_date: "2026-11-12" };
    const [r] = resolveDeals([deal()], [partner], [barcelona, madrid], [ana]);
    expect(r.exp?.id).toBe("eMad");
    expect(r.candIds).toEqual(["eMad", "eBcn"]);
    expect(flagKeys(r)).toContain("multi");
  });

  it("cliente fora da lista: vincula, remunera e sinaliza", () => {
    const d = deal({ passengers: [pax("Marcelo", { is_titular: true })] });
    const [r] = resolveDeals([d], [partner], [madrid], [ana]);
    expect(r.exp?.id).toBe("eMad");
    expect(r.com.total).toBeCloseTo(450);
    expect(flagKeys(r)).toEqual(["fora"]);
    expect(r.needsReview).toBe(true);
  });

  it("roteiro com coordenadas de aeroporto: cidade fora da lista casa pelo raio", () => {
    const bangkok: Expedition = { ...madrid, id: "eBkk", city: "Bangkok", start_date: "2026-12-01", days: 15 };
    // U-Tapao (Pattaya), ~140 km de Bangkok; não está na lista de cidades
    const d = deal({ legs: [{ city: "Pattaya", date: "2026-11-30", lat: 12.68, lng: 101.005 }], end_date: "2026-12-16" });
    const [r] = resolveDeals([d], [partner], [bangkok], [ana]);
    expect(r.exp?.id).toBe("eBkk");
    expect(flagKeys(r)).toContain("aprox");
    expect(r.reason).toMatch(/Pattaya fica a 1\d\d km de Bangkok/);
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
    const [r] = resolveDeals([d], [partner], [madrid, bangkok], [ana]);
    expect(r.exp?.id).toBe("eBkk");
    expect(r.com.total).toBeCloseTo(707.1); // 3% de R$ 23.570
  });

  it("comissão 3% / 3% / 5% sobre o valor do negócio (acordo, item 4.1)", () => {
    const [r] = resolveDeals([deal()], [partner], [madrid], [ana]);
    expect(r.com.voo).toBeCloseTo(240);
    expect(r.com.hotel).toBeCloseTo(180);
    expect(r.com.seguro).toBeCloseTo(30);
    expect(r.com.total).toBeCloseTo(450);
  });
});

// ---------------------------------------------------------------- Vários passageiros (SPEC v1.1, §8)

describe("negócios com vários passageiros", () => {
  const emerson = client("Emerson", "2026-10-01");
  const gislaine = client("Gislaine", "2026-10-02");
  const casal = () =>
    deal({ hubspot_id: "4512", passengers: [pax("Emerson", { is_titular: true }), pax("Gislaine")] });

  it("casal num negócio, os dois cadastrados: duas linhas, valores só na do titular, comissão uma vez", () => {
    const l = new Ledger([casal()], [partner], [madrid], [emerson, gislaine]);
    const a = l.clientLine(emerson);
    const b = l.clientLine(gislaine);

    expect(a.deals.map((r) => dealNo(r.deal))).toEqual(["#4512"]);
    expect(b.deals.map((r) => dealNo(r.deal))).toEqual(["#4512"]);
    expect(a.values).toEqual({ voo: 8000, hotel: 6000, seguro: 600 });
    expect(a.com.total).toBeCloseTo(450);
    expect(b.primary).toEqual([]);
    expect(b.included.map((r) => dealNo(r.deal))).toEqual(["#4512"]);
    expect(b.com.total).toBe(0);
    expect(a.stage).toBe("fechado");
    expect(b.stage).toBe("fechado");

    const t = l.expStats(madrid);
    expect(t.total).toBeCloseTo(450);
    expect(t.sold).toBe(14600);
    expect(t.deals).toBe(1);
    expect(t.closed).toBe(2);
    expect(l.resolved[0].flags).toEqual([]);
  });

  it("só o titular cadastrado: sem 'fora da lista'; Vay vê o acompanhante como não cadastrado", () => {
    const l = new Ledger([casal()], [partner], [madrid], [emerson]);
    const r = l.resolved[0];
    expect(flagKeys(r)).toEqual(["passageiro"]);
    expect(r.needsReview).toBe(false); // informativa, não gera pendência
    const line = l.clientLine(emerson);
    expect(line.unregistered.map((u) => u.passenger.name)).toEqual(["Gislaine"]);
    expect(line.hiddenPassengers).toBe(1);
    expect(l.pendingFor(madrid)).toBe(0);
  });

  it("só o titular cadastrado, visão do parceiro: '+1 passageiro não cadastrado', sem identidade", () => {
    // O banco (RLS) só entrega ao parceiro os passageiros que ele cadastrou; a contagem vem em passenger_count.
    const d = casal();
    const visible = { ...d, passengers: d.passengers.filter((p) => p.name === "Emerson") };
    const l = new Ledger([visible], [partner], [madrid], [emerson]);
    const line = l.clientLine(emerson);
    expect(line.hiddenPassengers).toBe(1);
    expect(line.unregistered).toEqual([]);
    expect(line.com.total).toBeCloseTo(450);
    expect(flagKeys(l.resolved[0])).not.toContain("fora");
  });

  it("titular não cadastrado, acompanhante cadastrado: sem 'fora da lista'; valores na linha do acompanhante", () => {
    const l = new Ledger([casal()], [partner], [madrid], [gislaine]);
    expect(flagKeys(l.resolved[0])).toEqual(["passageiro"]);
    const line = l.clientLine(gislaine);
    expect(line.primary.length).toBe(1);
    expect(line.values).toEqual({ voo: 8000, hotel: 6000, seguro: 600 });
    expect(line.com.total).toBeCloseTo(450);
    expect(line.unregistered.map((u) => u.passenger.name)).toEqual(["Emerson"]);
  });

  it("sem titular cadastrado, a linha principal é o primeiro passageiro cadastrado (ordem de cadastro)", () => {
    const d = deal({ passengers: [pax("Emerson", { is_titular: true }), pax("Gislaine"), pax("Caio")] });
    const caio = client("Caio", "2026-09-30");
    const l = new Ledger([d], [partner], [madrid], [gislaine, caio]);
    expect(l.resolved[0].primaryClientId).toBe("c-Caio");
  });

  it("passageiro em dois negócios: coluna Negócio com os dois números; totais sem duplicidade", () => {
    const d1 = casal();
    const d2 = deal({ hubspot_id: "4600", voo: 1000, hotel: 0, seguro: 0, passengers: [pax("Gislaine", { is_titular: true })] });
    const l = new Ledger([d1, d2], [partner], [madrid], [emerson, gislaine]);
    const g = l.clientLine(gislaine);
    expect(g.deals.map((r) => dealNo(r.deal)).sort()).toEqual(["#4512", "#4600"]);
    expect(g.primary.map((r) => dealNo(r.deal))).toEqual(["#4600"]);
    expect(g.included.map((r) => dealNo(r.deal))).toEqual(["#4512"]);
    expect(g.com.total).toBeCloseTo(30);

    const t = l.expStats(madrid);
    expect(t.deals).toBe(2);
    expect(t.total).toBeCloseTo(480); // 450 + 30, cada negócio uma vez
    expect(t.sold).toBe(15600);
    const sumOfLines = [emerson, gislaine].reduce((a, c) => a + l.clientLine(c).com.total, 0);
    expect(sumOfLines).toBeCloseTo(t.total);
  });

  it("cliente que é linha principal em dois negócios: valores somados", () => {
    const d1 = casal();
    const d2 = deal({ voo: 1000, hotel: 0, seguro: 0, passengers: [pax("Emerson", { is_titular: true })] });
    const l = new Ledger([d1, d2], [partner], [madrid], [emerson, gislaine]);
    expect(l.clientLine(emerson).values.voo).toBe(9000);
  });

  it("negócio sem rótulo 'Titular': vincula normalmente e sinaliza 'Titular não definido'", () => {
    const d = { ...casal(), titular_labeled: false };
    const l = new Ledger([d], [partner], [madrid], [emerson, gislaine]);
    const r = l.resolved[0];
    expect(r.exp?.id).toBe("eMad");
    expect(flagKeys(r)).toEqual(["titular"]);
    expect(r.needsReview).toBe(true);
    expect(l.pendingFor(madrid)).toBe(1);
  });
});

// ---------------------------------------------------------------- Não sinalizados no HubSpot

describe("negócios não sinalizados no HubSpot", () => {
  const atlas: Partner = { ...partner, id: "pB", name: "Grupo Atlas", afiliado: "Grupo Atlas" };
  const gramado: Expedition = { ...madrid, id: "eGra", partner_id: "pB", city: "Gramado", start_date: "2026-12-03", days: 4 };
  const ana = client("Ana", "2026-10-01");
  const naoSinalizado = (over: Partial<Deal> = {}) =>
    deal({ signaled: false, afiliado: "", hs_origem: "Passivo [ação do contato]", hs_agency: "", ...over });

  it("destino e data compatíveis: aparece na expedição, não remunera e diz o que corrigir", () => {
    const l = new Ledger([naoSinalizado({ passengers: [pax("Marcelo", { is_titular: true })] })], [partner], [madrid], [ana]);
    const r = l.resolved[0];
    expect(r.exp).toBeNull();
    expect(r.suggested?.id).toBe("eMad");
    expect(r.partner?.id).toBe("pA");
    expect(r.com.total).toBe(0);
    expect(r.potential.total).toBeCloseTo(450);
    expect(flagKeys(r)).toEqual(["nao_sinalizado"]);
    expect(r.listEvidence).toBe(false);
    expect(r.fixes).toEqual([
      'marcar "Origem do Negócio" como "Afiliado" (hoje: Passivo [ação do contato])',
      'associar a empresa "Horizonte Eventos" ao negócio',
    ]);
    // fora dos totais e do que o parceiro recebe
    expect(l.paid).toEqual([]);
    expect(l.expStats(madrid).total).toBe(0);
    expect(l.unsignaledFor(madrid).length).toBe(1);
    expect(l.pendingFor(madrid)).toBe(1);
  });

  it("passageiro na lista do parceiro (mesmo nome, sem e-mail que bata) é destacado", () => {
    const anaRibeiro = client("Ana Ribeiro", "2026-10-01");
    const d = naoSinalizado({ passengers: [pax("ANA  RIBEIRO", { email: "outro@email.com", is_titular: true })] });
    expect(resolveDeals([d], [partner], [madrid], [anaRibeiro])[0].listEvidence).toBe(true);
    // só o primeiro nome não basta
    const d2 = naoSinalizado({ passengers: [pax("Ana", { email: "outro@email.com", is_titular: true })] });
    expect(resolveDeals([d2], [partner], [madrid], [ana])[0].listEvidence).toBe(false);
  });

  it("empresa da agência associada, mas origem errada: só pede a origem e fica no parceiro certo", () => {
    const d = naoSinalizado({ hs_agency: "Grupo Atlas", legs: [{ city: "Gramado", date: "2026-12-03" }], end_date: "2026-12-06" });
    const [r] = resolveDeals([d], [partner, atlas], [madrid, gramado], [ana]);
    expect(r.suggested?.id).toBe("eGra");
    expect(r.fixes).toEqual(['marcar "Origem do Negócio" como "Afiliado" (hoje: Passivo [ação do contato])']);
  });

  it("sem expedição compatível: ignorado, sem pendência", () => {
    const d = naoSinalizado({ legs: [{ city: "Paris", date: "2026-08-01" }], end_date: "2026-08-10" });
    const l = new Ledger([d], [partner], [madrid], [ana]);
    expect(l.resolved[0].suggested).toBeNull();
    expect(l.resolved[0].needsReview).toBe(false);
    expect(l.pendingFor(madrid)).toBe(0);
  });

  it("conferido pela Vay deixa de ser pendência", () => {
    const l = new Ledger([naoSinalizado({ reviewed: true })], [partner], [madrid], [ana]);
    expect(l.pendingFor(madrid)).toBe(0);
    expect(l.unsignaledFor(madrid).length).toBe(1);
  });
});

describe("expedição com destino livre e aeroporto de chegada", () => {
  const tailandia: Expedition = { ...madrid, id: "eTh", city: "Tailândia", arrival_airport: "BKK", start_date: "2026-12-01", days: 15 };
  const ana = client("Ana", "2026-10-01");

  it("trecho em Bangkok (aeroporto BKK) conta como o destino, mesmo com o destino escrito como país", () => {
    const d = deal({ legs: [{ city: "Bangkok", date: "2026-11-30", lat: 13.68, lng: 100.75 }], end_date: "2026-12-16" });
    const [r] = resolveDeals([d], [partner], [tailandia], [ana]);
    expect(r.exp?.id).toBe("eTh");
    expect(r.reason).toContain("Tailândia está no roteiro");
  });

  it("Phuket fica a ~690 km: vincula por aproximação", () => {
    const d = deal({ legs: [{ city: "Phuket", date: "2026-11-30", lat: 8.11, lng: 98.32 }], end_date: "2026-12-16" });
    const [r] = resolveDeals([d], [partner], [tailandia], [ana]);
    expect(r.exp?.id).toBe("eTh");
    expect(flagKeys(r)).toContain("aprox");
  });

  it("sem aeroporto e com destino fora da lista de cidades: não há como vincular", () => {
    const semAeroporto = { ...tailandia, arrival_airport: null };
    const d = deal({ legs: [{ city: "Bangkok", date: "2026-11-30", lat: 13.68, lng: 100.75 }], end_date: "2026-12-16" });
    expect(resolveDeals([d], [partner], [semAeroporto], [ana])[0].exp).toBeNull();
  });
});

describe("etapa exibida", () => {
  it("compra concluída no HubSpot prevalece sobre tudo", () => {
    expect(shownStage({ stage: "outro_lugar", hs_status: null }, true)).toBe("fechado");
    expect(shownStage({ stage: "nao_contactar", hs_status: "fechado" }, false)).toBe("fechado");
  });
  it("marcação manual da Vay prevalece sobre em negociação", () => {
    expect(shownStage({ stage: "nao_contactar", hs_status: "negociacao" }, false)).toBe("nao_contactar");
    expect(shownStage({ stage: "outro_lugar", hs_status: null }, false)).toBe("outro_lugar");
  });
  it("negócio em aberto → em negociação; nada → não contactado", () => {
    expect(shownStage({ stage: "auto", hs_status: "negociacao" }, false)).toBe("negociacao");
    expect(shownStage({ stage: "auto", hs_status: null }, false)).toBe("novo");
  });
});

describe("correspondência cliente ↔ passageiro", () => {
  it("ID do HubSpot prevalece sobre e-mail", () => {
    expect(samePerson({ hubspot_contact_id: "1", email: "a@x.com" }, { hubspot_contact_id: "2", email: "a@x.com" })).toBe(false);
    expect(samePerson({ hubspot_contact_id: "1", email: "a@x.com" }, { hubspot_contact_id: "1", email: "b@x.com" })).toBe(true);
  });
  it("sem ID, compara e-mail sem diferenciar maiúsculas", () => {
    expect(samePerson({ email: "Ana@X.com" }, { hubspot_contact_id: "9", email: "ana@x.com " })).toBe(true);
  });
  it("sem e-mail, compara telefone (só dígitos, últimos 11)", () => {
    expect(samePerson({ phone: "(51) 99999-0000" }, { phone: "+55 51 99999-0000" })).toBe(true);
    expect(samePerson({ phone: "" }, { phone: "" })).toBe(false);
  });
});
