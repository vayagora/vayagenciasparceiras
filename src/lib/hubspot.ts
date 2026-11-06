// Cliente HubSpot (app privado) + conversões puras usadas na sincronização (SPEC §4.4, §6).
// Segredos e nomes internos de propriedades vêm de variáveis de ambiente (ver .env.example).
import { CITIES } from "./cities";
import type { Leg } from "./types";

const API = "https://api.hubapi.com";

export type HubspotConfig = {
  token: string;
  wonStages: string[];
  titularLabel: string;
  props: {
    afiliado: string;
    roteiro: string;
    dataVolta: string;
    voo: string;
    hotel: string;
    seguro: string;
  };
};

export function hubspotConfig(env: Record<string, string | undefined> = process.env): HubspotConfig | null {
  const token = env.HUBSPOT_TOKEN;
  if (!token) return null;
  return {
    token,
    wonStages: (env.HUBSPOT_WON_STAGES ?? "closedwon").split(",").map((s) => s.trim()).filter(Boolean),
    titularLabel: env.HUBSPOT_TITULAR_LABEL ?? "Titular",
    props: {
      afiliado: env.HUBSPOT_PROP_AFILIADO ?? "afiliado",
      roteiro: env.HUBSPOT_PROP_ROTEIRO ?? "roteiro",
      dataVolta: env.HUBSPOT_PROP_DATA_VOLTA ?? "data_volta",
      voo: env.HUBSPOT_PROP_VALOR_VOO ?? "valor_voo",
      hotel: env.HUBSPOT_PROP_VALOR_HOSPEDAGEM ?? "valor_hospedagem",
      seguro: env.HUBSPOT_PROP_VALOR_SEGURO ?? "valor_seguro",
    },
  };
}

// ---------------------------------------------------------------- Conversões puras

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const CITY_BY_FOLD = new Map(CITIES.map((c) => [fold(c.name), c.name]));

// Nome da cidade como está na lista de destinos (ignora acentos e maiúsculas).
// Cidade fora da lista fica como veio (não casa com expedição até a geocodificação entrar).
export function normalizeCity(name: string): string {
  return CITY_BY_FOLD.get(fold(name)) ?? name.trim();
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

// Roteiro: JSON [{"city":"Madrid","date":"2026-11-13"}] ou texto "Lisboa|2026-11-09;Madrid|2026-11-13".
export function parseRoteiro(raw: string | null | undefined): Leg[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  let legs: Leg[] = [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s) as { city?: string; date?: string }[];
      legs = arr.map((x) => ({ city: String(x.city ?? ""), date: String(x.date ?? "") }));
    } catch {
      return [];
    }
  } else {
    legs = s.split(/[;\n]/).map((part) => {
      const [city = "", date = ""] = part.split("|");
      return { city, date };
    });
  }
  return legs
    .map((l) => ({ city: normalizeCity(l.city), date: toIsoDate(l.date) ?? "" }))
    .filter((l) => l.city && l.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
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
  const props = ["closedate", "dealstage", ...Object.values(cfg.props)];
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
              { propertyName: cfg.props.afiliado, operator: "HAS_PROPERTY" },
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
