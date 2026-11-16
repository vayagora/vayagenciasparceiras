// Cliente HubSpot (app privado) + conversões puras usadas na sincronização (SPEC §4.4, §6).
// Layout dos campos do negócio na conta da Vay Agora: ver docs/HUBSPOT.md.
// Segredos e o que pode mudar vêm de variáveis de ambiente (ver .env.example).
import { AIRPORT_ALIASES, AIRPORTS } from "./airports";
import { CITIES, cityOf, nearestCity } from "./cities";
import type { Product } from "./commission";
import type { DealDetails, Leg } from "./types";

const API = "https://api.hubapi.com";

export type HubspotConfig = {
  token: string;
  wonStages: string[];
  titularLabels: string[]; // rótulos que marcam o titular (padrão: "Titular" ou "Comprador")
  buyerLabel: string;
  passengerLabel: string;
  // Negócio de agência parceira = este campo com um destes valores + empresa (agência) associada ao negócio.
  // O primeiro valor é o que o sistema pede para marcar ao corrigir um negócio.
  origemProp: string;
  origemValues: string[];
  // Etapas "antes da compra" (em negociação) e de negócio perdido
  openStages: string[];
  lostStages: string[];
  // Campo do negócio com as observações para o parceiro
  obsProp: string;
};

export function hubspotConfig(env: Record<string, string | undefined> = process.env): HubspotConfig | null {
  const token = env.HUBSPOT_TOKEN;
  if (!token) return null;
  return {
    token,
    // 135525686 = "Emissão Realizada" no funil "Pipeline de Vendas"
    wonStages: (env.HUBSPOT_WON_STAGES ?? "135525686").split(",").map((s) => s.trim()).filter(Boolean),
    titularLabels: (env.HUBSPOT_TITULAR_LABEL ?? "Titular,Comprador").split(",").map((s) => s.trim()).filter(Boolean),
    buyerLabel: env.HUBSPOT_BUYER_LABEL ?? "Comprador",
    passengerLabel: env.HUBSPOT_PASSENGER_LABEL ?? "Passageiro",
    origemProp: env.HUBSPOT_ORIGEM_PROP ?? "origem_do_negocio",
    origemValues: (env.HUBSPOT_ORIGEM_VALUE ?? "Agência Parceira,Afiliado").split(",").map((s) => s.trim()).filter(Boolean),
    openStages: (env.HUBSPOT_OPEN_STAGES ?? "appointmentscheduled,qualifiedtobuy,presentationscheduled,135850329,contractsent,135525685")
      .split(",").map((s) => s.trim()).filter(Boolean),
    lostStages: (env.HUBSPOT_LOST_STAGES ?? "closedlost").split(",").map((s) => s.trim()).filter(Boolean),
    obsProp: env.HUBSPOT_PROP_OBS_PARCEIRO ?? "observacoes_para_parceiro",
  };
}

// Campos do negócio na conta da Vay Agora (nomes internos; os rótulos estão ao lado).
// Os nomes internos de alguns trechos não batem com o rótulo: vale o rótulo.
export const FIELDS = {
  servico: "servico", // Serviço: o que está sendo comercializado
  payment: "forma_de_pagamento", // Forma de pagamento do cliente (várias opções separadas por ";")
  amount: "amount", // Valor do negócio
  // Origem, destino, data, hora de saída, hora de chegada e companhia de cada trecho aéreo
  trechos: [
    { from: "aeroporto_de_destino", dest: "aeroporto_de_partida", date: "data_da_volta_", dep: "hora_descolagem_ida", arr: "hora_chegada_volta", airline: "companhia_aerea_ida" },
    { from: "aeroporto_de_partida___trecho_2", dest: "aeroporto_de_chegada___trecho_2", date: "data_de_chegada___trecho_2", dep: "hora_pouso_ida", arr: "hora_decolagem_volta", airline: "companhia_aerea_volta" },
    { from: "origem___trecho_3", dest: "destino___trecho_3", date: "data_da_ida_", dep: "hora_saida___trecho_3", arr: "hora_chegada___trecho_3", airline: "companhia_aerea___trecho_3" },
    { from: "origem___trecho_4", dest: "destino___trecho_4", date: "data_da_partida___trecho_2", dep: "hora_saida___trecho_4", arr: "hora_chegada___trecho_4", airline: "companhia_aerea___trecho_4" },
    { from: "origem___trecho_5", dest: "destino___trecho_5", date: "data___trecho_5", dep: "hora_saida___trecho_5", arr: "hora_chegada___trecho_5", airline: "companhia_aerea___trecho_5" },
    { from: "origem___trecho_6", dest: "destino___trecho_6", date: "data___trecho_6", dep: "hora_saida___trecho_6", arr: "hora_chegada___trecho_6", airline: "companhia_aerea___trecho_6" },
  ],
  hotel: {
    city: "cidade__hotel_",
    start: "data_de_checkin",
    end: "data_de_checkout",
    name: "fornecedor__hotel_",
    checkinTime: "hora_de_checkin_hospedpacsalavip",
    checkoutTime: "hora_de_checkout_hospedpacsalavip",
    room: "configuracao_dos_quartos",
    category: "categoria_de_hospedagem",
    board: "cafe_da_manha__hotel_",
  },
  seguro: {
    dest: "destino__seguro_",
    start: "data_de_inicio_da_viagem",
    end: "data_de_termino_da_viagem__seguro_",
    plan: "nome_do_plano__seguro_",
    type: "tipo_de_seguro__hero_",
    coverage: "valor_da_cobertura__seguro_",
  },
} as const;

// Valor do campo "Serviço" → produto comissionado. Outros serviços não geram comissão.
export const SERVICE_PRODUCT: Record<string, Product> = {
  "Passagem Aérea": "voo",
  Hospedagem: "hotel",
  "Seguro Viagem": "seguro",
};

export function dealProperties(cfg: HubspotConfig): string[] {
  return [
    "dealname",
    "closedate",
    "dealstage",
    cfg.origemProp,
    cfg.obsProp,
    FIELDS.servico,
    FIELDS.payment,
    FIELDS.amount,
    ...FIELDS.trechos.flatMap((t) => Object.values(t)),
    ...Object.values(FIELDS.hotel),
    ...Object.values(FIELDS.seguro),
  ];
}

// ---------------------------------------------------------------- Conversões puras

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const CITY_BY_FOLD = new Map(CITIES.map((c) => [fold(c.name), c.name]));

// Nome da cidade como está na lista de destinos (ignora acentos e maiúsculas; "Bangkok, Tailândia" → "Bangkok").
// Cidade fora da lista fica como veio.
export function normalizeCity(name: string): string {
  const raw = String(name ?? "").trim();
  return CITY_BY_FOLD.get(fold(raw)) ?? CITY_BY_FOLD.get(fold(raw.split(",")[0])) ?? raw.split(",")[0].trim();
}

// "AAAA-MM-DD", timestamp em ms ou ISO com hora → data no fuso de São Paulo.
export function toIsoDate(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = /^\d+$/.test(s) ? new Date(Number(s)) : new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

// Opção do campo "Destino - Trecho N" (ex.: "BKK – Bangkok, Thailand – Bangkok Intl Airport,") → cidade + coordenadas.
// Aeroporto a até 60 km de uma cidade da lista vira essa cidade (GRU → São Paulo), para o vínculo exato funcionar.
export function airportPlace(value: string): Omit<Leg, "date"> | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  const code = AIRPORT_ALIASES[v] ?? v.match(/^([A-Z0-9]{3})\s*[–-]/)?.[1];
  const ap = code ? AIRPORTS[code] : undefined;
  if (ap) {
    const [city, lat, lng] = ap;
    const near = nearestCity(lat, lng);
    return near ? { city: near.name, lat: near.lat, lng: near.lng } : { city, lat, lng };
  }
  const name = v.replace(/^[A-Z0-9]{3}\s*[–-]\s*/, "");
  return { city: normalizeCity(name) };
}

function textPlace(text: string | null | undefined): Omit<Leg, "date"> | null {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const city = normalizeCity(t);
  const c = cityOf(city);
  return c ? { city, lat: c.lat, lng: c.lng } : { city };
}

// "Pix/Ted/Doc;Crédito na VAY" → ["Pix/Ted/Doc", "Crédito na VAY"]
export function paymentMethods(v: string | null | undefined): string[] {
  return String(v ?? "").split(";").map((x) => x.trim()).filter(Boolean);
}

// Aeroporto para exibir: "BKK · Bangkok".
export function airportShort(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  const code = AIRPORT_ALIASES[v] ?? v.match(/^([A-Z0-9]{3})\s*[–-]/)?.[1];
  if (!code) return v;
  const city = AIRPORTS[code]?.[0] ?? v.replace(/^[A-Z0-9]{3}\s*[–-]\s*/, "").split(",")[0].trim();
  return city ? `${code} · ${city}` : code;
}

// Hora do HubSpot (texto "10:30", ISO ou timestamp) → "HH:MM" no horário de Brasília.
export function toTime(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5);
  const d = /^\d{10,}$/.test(s) ? new Date(Number(s)) : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
}

const txt = (v: string | null | undefined) => String(v ?? "").trim();

// Detalhes do produto para o modal (sem código de reserva: esse fica só no HubSpot).
export function readDetails(p: Record<string, string | null | undefined>, product: Product): DealDetails {
  if (product === "voo") {
    const segments = FIELDS.trechos
      .map((t) => ({
        from: airportShort(p[t.from]),
        to: airportShort(p[t.dest]),
        date: toIsoDate(p[t.date]) ?? "",
        dep: toTime(p[t.dep]),
        arr: toTime(p[t.arr]),
        airline: txt(p[t.airline]),
      }))
      .filter((x) => x.to && x.date)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { voo: { segments } };
  }
  if (product === "hotel") {
    const h = FIELDS.hotel;
    return {
      hotel: {
        name: txt(p[h.name]),
        city: txt(p[h.city]),
        checkin: toIsoDate(p[h.start]) ?? "",
        checkout: toIsoDate(p[h.end]) ?? "",
        checkinTime: toTime(p[h.checkinTime]),
        checkoutTime: toTime(p[h.checkoutTime]),
        room: [txt(p[h.category]), txt(p[h.room])].filter(Boolean).join(" · "),
        board: txt(p[h.board]),
      },
    };
  }
  const g = FIELDS.seguro;
  return {
    seguro: {
      plan: txt(p[g.plan]),
      type: txt(p[g.type]),
      destination: txt(p[g.dest]),
      start: toIsoDate(p[g.start]) ?? "",
      end: toIsoDate(p[g.end]) ?? "",
      coverage: txt(p[g.coverage]),
    },
  };
}

export type Trip = { product: Product; value: number; legs: Leg[]; end: string; details: DealDetails };

// Só o roteiro, para negócios ainda em negociação (o serviço e o valor podem não estar preenchidos).
export function readLegsAny(p: Record<string, string | null | undefined>): { legs: Leg[]; end: string } | null {
  const tries: Record<string, string | null | undefined>[] = [
    { ...p, [FIELDS.servico]: "Passagem Aérea", [FIELDS.amount]: "1" },
    { ...p, [FIELDS.servico]: "Hospedagem", [FIELDS.amount]: "1" },
    { ...p, [FIELDS.servico]: "Seguro Viagem", [FIELDS.amount]: "1" },
  ];
  for (const t of tries) {
    const r = readTrip(t);
    if (!("skip" in r)) return { legs: r.legs, end: r.end };
  }
  return null;
}

// Lê produto, valor e roteiro de um negócio. Devolve o motivo quando não dá para usar.
export function readTrip(p: Record<string, string | null | undefined>): Trip | { skip: string } {
  const servico = String(p[FIELDS.servico] ?? "").trim();
  const product = SERVICE_PRODUCT[servico];
  if (!product) return { skip: servico ? `serviço "${servico}" não gera comissão` : "campo Serviço vazio" };
  const value = money(p[FIELDS.amount]);
  if (value <= 0) return { skip: "valor do negócio vazio" };

  let legs: Leg[] = [];
  let end: string | null = null;
  if (product === "voo") {
    for (const t of FIELDS.trechos) {
      const place = airportPlace(String(p[t.dest] ?? ""));
      const date = toIsoDate(p[t.date]);
      if (place && date) legs.push({ ...place, date });
    }
  } else {
    const f = product === "hotel" ? { place: textPlace(p[FIELDS.hotel.city]), start: p[FIELDS.hotel.start], end: p[FIELDS.hotel.end] }
      : { place: textPlace(p[FIELDS.seguro.dest]), start: p[FIELDS.seguro.start], end: p[FIELDS.seguro.end] };
    const start = toIsoDate(f.start);
    if (f.place && start) legs = [{ ...f.place, date: start }];
    end = toIsoDate(f.end);
  }
  legs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!legs.length) return { skip: "sem destino e data (trechos, check-in ou vigência)" };
  return { product, value, legs, end: end ?? legs[legs.length - 1].date, details: readDetails(p, product) };
}

export function money(v: string | number | null | undefined): number {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export type Association = { contactId: string; labels: string[]; order: number };

// Titular = contato com o rótulo "Titular". Sem rótulo, o associado há mais tempo
// (primeira vez que a sincronização viu a associação; empate pela ordem da API) + sinalização.
export const hasLabel = (a: Association, label: string) => a.labels.some((l) => fold(l) === fold(label));

// label: um ou mais rótulos de titular (ex.: "Titular" ou "Comprador"). Entre os rotulados, prefere quem viaja
// (rótulo de passageiro). Negócio com um contato só não precisa de rótulo.
export function pickTitular(
  assocs: Association[],
  label: string | string[],
  firstSeen: Map<string, string> = new Map(),
  passengerLabel = "Passageiro",
): { titularId: string | null; labeled: boolean } {
  if (!assocs.length) return { titularId: null, labeled: true };
  const wants = (Array.isArray(label) ? label : [label]).map(fold);
  const labeled = assocs
    .filter((a) => a.labels.some((l) => wants.includes(fold(l))))
    .sort((a, b) => Number(hasLabel(b, passengerLabel)) - Number(hasLabel(a, passengerLabel)) || a.order - b.order);
  if (labeled.length) return { titularId: labeled[0].contactId, labeled: true };
  if (assocs.length === 1) return { titularId: assocs[0].contactId, labeled: true };
  const far = "9999-12-31T00:00:00Z";
  const oldest = [...assocs].sort(
    (a, b) =>
      (firstSeen.get(a.contactId) ?? far).localeCompare(firstSeen.get(b.contactId) ?? far) || a.order - b.order,
  )[0];
  return { titularId: oldest.contactId, labeled: false };
}

export function contactName(p: Record<string, string | null | undefined>): string {
  const n = [p.firstname, p.lastname].filter(Boolean).join(" ").trim();
  return n || p.email || p.phone || "Contato sem nome";
}

// Agência do negócio = empresa associada cujo nome é um parceiro cadastrado (ignora acentos e maiúsculas).
// Devolve o nome como está no sistema. Sem parceiro correspondente, devolve o nome da primeira empresa
// (o negócio entra sinalizado "Nenhuma expedição encontrada" / afiliado sem parceiro); sem empresa, null.
export function pickAgency(companyNames: string[], partnerAfiliados: string[]): string | null {
  const names = companyNames.map((n) => n.trim()).filter(Boolean);
  return matchPartner(names, partnerAfiliados) ?? names[0] ?? null;
}

// Só a empresa que é parceira cadastrada (nome como está no sistema), ou null.
export function matchPartner(companyNames: string[], partnerAfiliados: string[]): string | null {
  for (const n of companyNames) {
    const hit = partnerAfiliados.find((a) => fold(a) === fold(n));
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------- Chamadas à API

export class HubspotError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Novas tentativas com espera crescente em 429 e 5xx.
async function call<T>(cfg: HubspotConfig, path: string, body?: unknown, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    const res = await fetch(API + path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (res.ok) return (await res.json()) as T;
    const retry = res.status === 429 || res.status >= 500;
    if (!retry || i >= tries - 1) {
      const txt = (await res.text()).slice(0, 300);
      throw new HubspotError(`HubSpot ${res.status} em ${path}: ${txt}`);
    }
    await sleep(1000 * 2 ** i);
  }
}

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export type HsDeal = { id: string; properties: Record<string, string | null> };

type Filter = { propertyName: string; operator: string; value?: string; values?: string[]; highValue?: string };

async function searchDeals(cfg: HubspotConfig, filterGroups: { filters: Filter[] }[]): Promise<HsDeal[]> {
  const out: HsDeal[] = [];
  let after: string | undefined;
  do {
    const r = await call<{ results: HsDeal[]; paging?: { next?: { after: string } } }>(cfg, "/crm/v3/objects/deals/search", {
      filterGroups,
      properties: dealProperties(cfg),
      sorts: [{ propertyName: "hs_object_id", direction: "ASCENDING" }],
      limit: 100,
      after,
    });
    out.push(...r.results);
    after = r.paging?.next?.after;
  } while (after);
  return out;
}

// Negócios da agência parceira (origem "Agência Parceira"/"Afiliado") em qualquer etapa do funil.
// Lê todos a cada sincronização para pegar também mudanças nas associações
// (que não alteram a data de modificação do negócio).
export function searchAgencyDeals(cfg: HubspotConfig): Promise<HsDeal[]> {
  return searchDeals(cfg, [
    {
      filters: [
        { propertyName: "dealstage", operator: "IN", values: [...cfg.wonStages, ...cfg.openStages, ...cfg.lostStages] },
        { propertyName: cfg.origemProp, operator: "IN", values: cfg.origemValues },
      ],
    },
  ]);
}

// Etapa do negócio no HubSpot → ganho, em aberto ou perdido (null = fora do funil de vendas)
export function stageKind(cfg: Pick<HubspotConfig, "wonStages" | "openStages" | "lostStages">, stage: string | null | undefined): "won" | "open" | "lost" | null {
  const s = String(stage ?? "");
  if (cfg.wonStages.includes(s)) return "won";
  if (cfg.openStages.includes(s)) return "open";
  if (cfg.lostStages.includes(s)) return "lost";
  return null;
}

// Origem marcada como negócio de agência parceira (ignora acentos e maiúsculas)
export function isAgencyOrigem(cfg: Pick<HubspotConfig, "origemValues">, v: string | null | undefined): boolean {
  const x = fold(String(v ?? ""));
  return !!x && cfg.origemValues.some((o) => fold(o) === x);
}

// Todos os negócios ganhos com viagem entre from e to (1º trecho aéreo, check-in ou início do seguro),
// para encontrar os que não foram sinalizados. Datas "AAAA-MM-DD".
export function searchWonDealsInWindow(cfg: HubspotConfig, from: string, to: string): Promise<HsDeal[]> {
  return searchWindow(cfg, cfg.wonStages, from, to);
}

function searchWindow(cfg: HubspotConfig, stages: string[], from: string, to: string): Promise<HsDeal[]> {
  const ms = (iso: string) => String(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  const stage: Filter = { propertyName: "dealstage", operator: "IN", values: stages };
  const dates = [FIELDS.trechos[0].date, FIELDS.hotel.start, FIELDS.seguro.start];
  return searchDeals(
    cfg,
    dates.map((prop) => ({ filters: [stage, { propertyName: prop, operator: "BETWEEN", value: ms(from), highValue: ms(to) }] })),
  );
}

// Negócios ganhos ou em aberto com viagem entre from e to (para achar os não sinalizados).
export function searchActiveDealsInWindow(cfg: HubspotConfig, from: string, to: string): Promise<HsDeal[]> {
  return searchWindow(cfg, [...cfg.wonStages, ...cfg.openStages], from, to);
}

// Variações de telefone como costumam estar gravadas no HubSpot (+5531999999999, 5531..., 31...).
export function phoneVariants(phone: string | null | undefined): string[] {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.length < 10) return [];
  const local = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  return [...new Set([`+55${local}`, `55${local}`, local, `+${d}`, d])];
}

export type HsPerson = { id: string; email: string; phones: string[]; name: string };

// Procura contatos por e-mail e por telefone (para ligar os clientes cadastrados aos contatos do HubSpot).
export async function findContacts(cfg: HubspotConfig, emails: string[], phones: string[]): Promise<HsPerson[]> {
  const props = ["firstname", "lastname", "email", "phone", "mobilephone", "hs_whatsapp_phone_number"];
  const found = new Map<string, HsPerson>();
  const run = async (filterGroups: { filters: Filter[] }[]) => {
    let after: string | undefined;
    do {
      const r = await call<{ results: { id: string; properties: Record<string, string | null> }[]; paging?: { next?: { after: string } } }>(
        cfg,
        "/crm/v3/objects/contacts/search",
        { filterGroups, properties: props, limit: 100, after },
      );
      for (const c of r.results) {
        const p = c.properties;
        found.set(c.id, {
          id: c.id,
          email: String(p.email ?? "").trim().toLowerCase(),
          phones: [p.phone, p.mobilephone, p.hs_whatsapp_phone_number].map((x) => String(x ?? "").trim()).filter(Boolean),
          name: contactName(p),
        });
      }
      after = r.paging?.next?.after;
    } while (after);
  };
  for (const part of chunk([...new Set(emails.filter(Boolean))], 100))
    await run([{ filters: [{ propertyName: "email", operator: "IN", values: part }] }]);
  const variants = [...new Set(phones.flatMap(phoneVariants))];
  for (const part of chunk(variants, 100))
    await run(["phone", "mobilephone", "hs_whatsapp_phone_number"].map((prop) => ({ filters: [{ propertyName: prop, operator: "IN", values: part }] })));
  return [...found.values()];
}

// Empresas (agências) associadas a cada negócio, com o nome.
export async function dealCompanies(cfg: HubspotConfig, dealIds: string[]): Promise<Map<string, string[]>> {
  const ids = new Map<string, string[]>();
  for (const part of chunk(dealIds, 100)) {
    const r = await call<{ results: { from: { id: string }; to: { toObjectId: number | string }[] }[] }>(
      cfg,
      "/crm/v4/associations/deals/companies/batch/read",
      { inputs: part.map((id) => ({ id })) },
    );
    for (const row of r.results) ids.set(String(row.from.id), row.to.map((t) => String(t.toObjectId)));
  }
  const names = new Map<string, string>();
  for (const part of chunk([...new Set([...ids.values()].flat())], 100)) {
    const r = await call<{ results: { id: string; properties: Record<string, string | null> }[] }>(
      cfg,
      "/crm/v3/objects/companies/batch/read",
      { properties: ["name"], inputs: part.map((id) => ({ id })) },
    );
    for (const c of r.results) names.set(c.id, String(c.properties.name ?? "").trim());
  }
  const out = new Map<string, string[]>();
  for (const [deal, cids] of ids) out.set(deal, cids.map((c) => names.get(c) ?? "").filter(Boolean));
  return out;
}

// Associações negócio → contatos (v4), com os rótulos.
export async function dealContacts(cfg: HubspotConfig, dealIds: string[]): Promise<Map<string, Association[]>> {
  const out = new Map<string, Association[]>();
  for (const ids of chunk(dealIds, 100)) {
    const r = await call<{
      results: { from: { id: string }; to: { toObjectId: number | string; associationTypes: { label: string | null }[] }[] }[];
    }>(cfg, "/crm/v4/associations/deals/contacts/batch/read", { inputs: ids.map((id) => ({ id })) });
    for (const row of r.results) {
      out.set(
        String(row.from.id),
        row.to.map((t, order) => ({
          contactId: String(t.toObjectId),
          labels: t.associationTypes.map((a) => a.label).filter((l): l is string => !!l),
          order,
        })),
      );
    }
  }
  return out;
}

export type HsContact = { id: string; name: string; email: string; phone: string };

export async function readContacts(cfg: HubspotConfig, ids: string[]): Promise<Map<string, HsContact>> {
  const out = new Map<string, HsContact>();
  for (const part of chunk([...new Set(ids)], 100)) {
    const r = await call<{ results: { id: string; properties: Record<string, string | null> }[] }>(
      cfg,
      "/crm/v3/objects/contacts/batch/read",
      { properties: ["firstname", "lastname", "email", "phone", "mobilephone"], inputs: part.map((id) => ({ id })) },
    );
    for (const c of r.results) {
      const p = c.properties;
      out.set(c.id, {
        id: c.id,
        name: contactName(p),
        email: String(p.email ?? "").trim().toLowerCase(),
        phone: String(p.phone || p.mobilephone || "").trim(),
      });
    }
  }
  return out;
}
