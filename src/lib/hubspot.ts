// Cliente HubSpot (app privado) + conversões puras usadas na sincronização (SPEC §4.4, §6).
// Layout dos campos do negócio na conta da Vay Agora: ver docs/HUBSPOT.md.
// Segredos e o que pode mudar vêm de variáveis de ambiente (ver .env.example).
import { AIRPORT_ALIASES, AIRPORTS } from "./airports";
import { CITIES, cityOf, nearestCity } from "./cities";
import type { Product } from "./commission";
import type { Leg } from "./types";

const API = "https://api.hubapi.com";

export type HubspotConfig = {
  token: string;
  wonStages: string[];
  titularLabel: string;
  afiliadoProp: string;
};

export function hubspotConfig(env: Record<string, string | undefined> = process.env): HubspotConfig | null {
  const token = env.HUBSPOT_TOKEN;
  if (!token) return null;
  return {
    token,
    // 135525686 = "Emissão Realizada" no funil "Pipeline de Vendas"
    wonStages: (env.HUBSPOT_WON_STAGES ?? "135525686").split(",").map((s) => s.trim()).filter(Boolean),
    titularLabel: env.HUBSPOT_TITULAR_LABEL ?? "Titular",
    afiliadoProp: env.HUBSPOT_PROP_AFILIADO ?? "agencia_parceira",
  };
}

// Campos do negócio na conta da Vay Agora (nomes internos; os rótulos estão ao lado).
// Os nomes internos de alguns trechos não batem com o rótulo: vale o rótulo.
export const FIELDS = {
  servico: "servico", // Serviço: o que está sendo comercializado
  amount: "amount", // Valor do negócio
  trechos: [
    { dest: "aeroporto_de_partida", date: "data_da_volta_" }, // Destino/Data - Trecho 1
    { dest: "aeroporto_de_chegada___trecho_2", date: "data_de_chegada___trecho_2" }, // Trecho 2
    { dest: "destino___trecho_3", date: "data_da_ida_" }, // Trecho 3
    { dest: "destino___trecho_4", date: "data_da_partida___trecho_2" }, // Trecho 4
    { dest: "destino___trecho_5", date: "data___trecho_5" }, // Trecho 5
    { dest: "destino___trecho_6", date: "data___trecho_6" }, // Trecho 6
  ],
  hotel: { city: "cidade__hotel_", start: "data_de_checkin", end: "data_de_checkout" },
  seguro: { dest: "destino__seguro_", start: "data_de_inicio_da_viagem", end: "data_de_termino_da_viagem__seguro_" },
} as const;

// Valor do campo "Serviço" → produto comissionado. Outros serviços não geram comissão.
export const SERVICE_PRODUCT: Record<string, Product> = {
  "Passagem Aérea": "voo",
  Hospedagem: "hotel",
  "Seguro Viagem": "seguro",
};

export function dealProperties(cfg: HubspotConfig): string[] {
  return [
    "closedate",
    "dealstage",
    cfg.afiliadoProp,
    FIELDS.servico,
    FIELDS.amount,
    ...FIELDS.trechos.flatMap((t) => [t.dest, t.date]),
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

export type Trip = { product: Product; value: number; legs: Leg[]; end: string };

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
  return { product, value, legs, end: end ?? legs[legs.length - 1].date };
}

export function money(v: string | number | null | undefined): number {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export type Association = { contactId: string; labels: string[]; order: number };

// Titular = contato com o rótulo "Titular". Sem rótulo, o associado há mais tempo
// (primeira vez que a sincronização viu a associação; empate pela ordem da API) + sinalização.
export function pickTitular(
  assocs: Association[],
  label: string,
  firstSeen: Map<string, string> = new Map(),
): { titularId: string | null; labeled: boolean } {
  if (!assocs.length) return { titularId: null, labeled: true };
  const want = fold(label);
  const labeled = assocs.filter((a) => a.labels.some((l) => fold(l) === want)).sort((a, b) => a.order - b.order);
  if (labeled.length) return { titularId: labeled[0].contactId, labeled: true };
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

// Negócios ganhos com "afiliado" preenchido. Lê todos a cada sincronização para pegar
// também mudanças nas associações (que não alteram a data de modificação do negócio).
export async function searchWonDeals(cfg: HubspotConfig): Promise<HsDeal[]> {
  const props = dealProperties(cfg);
  const out: HsDeal[] = [];
  let after: string | undefined;
  do {
    const r = await call<{ results: HsDeal[]; paging?: { next?: { after: string } } }>(
      cfg,
      "/crm/v3/objects/deals/search",
      {
        filterGroups: [
          {
            filters: [
              { propertyName: "dealstage", operator: "IN", values: cfg.wonStages },
              { propertyName: cfg.afiliadoProp, operator: "HAS_PROPERTY" },
            ],
          },
        ],
        properties: props,
        sorts: [{ propertyName: "hs_object_id", direction: "ASCENDING" }],
        limit: 100,
        after,
      },
    );
    out.push(...r.results);
    after = r.paging?.next?.after;
  } while (after);
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
