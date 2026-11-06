// Vínculo negócio → expedição (SPEC §4.4) e correspondência cliente ↔ passageiro (SPEC §3).
// Qualquer mudança aqui exige teste em matching.test.ts.
import { cityOf, kmBetween } from "./cities";
import { dealCom, ZERO, type Money, type Tone } from "./commission";
import { dayNum, digits, dm, lower } from "./format";
import type { Client, Deal, Expedition, Partner, Passenger } from "./types";

// Tolerâncias padrão (configuráveis por parâmetro)
export const TOL_BEFORE = 7;
export const TOL_AFTER = 3;
export const RADIUS_KM = 700;

export type Tolerances = { before: number; after: number; radiusKm: number };
export const DEFAULT_TOL: Tolerances = { before: TOL_BEFORE, after: TOL_AFTER, radiusKm: RADIUS_KM };

export const RULE_TIP = `O sistema vincula cada negócio pelo afiliado + data + destino: de ${TOL_BEFORE} dias antes a ${TOL_AFTER} dias depois da expedição, com a cidade da expedição em algum trecho ou uma cidade a até ${RADIUS_KM} km. Negócios do parceiro sem expedição aparecem aqui para vínculo manual.`;

// Número exibido do negócio: o ID do HubSpot, ou o sequencial dos lançados à mão.
export function dealNo(d: Pick<Deal, "hubspot_id" | "seq">): string {
  return `#${d.hubspot_id ?? d.seq}`;
}

// ---------------------------------------------------------------- Cliente ↔ passageiro

type Person = { hubspot_contact_id?: string | null; email?: string | null; phone?: string | null };

// Mesmo ID de contato no HubSpot; sem ID, mesmo e-mail; sem e-mail, mesmo telefone (últimos 11 dígitos).
// Espelha a função same_person() da migração 0002.
export function samePerson(a: Person, b: Person): boolean {
  if (a.hubspot_contact_id && b.hubspot_contact_id) return a.hubspot_contact_id === b.hubspot_contact_id;
  const ea = lower(a.email);
  const eb = lower(b.email);
  if (ea && eb) return ea === eb;
  const pa = digits(a.phone);
  const pb = digits(b.phone);
  if (pa && pb) return pa === pb;
  return false;
}

// ---------------------------------------------------------------- Data + destino

type Match = { approx: boolean; score: number; reason: string };

// Afiliado já filtrado antes; aqui avalia data + destino com as tolerâncias.
export function evalDeal(deal: Pick<Deal, "legs" | "end_date">, exp: Expedition, tol: Tolerances = DEFAULT_TOL): Match | null {
  if (!deal.legs?.length) return null;
  const es = dayNum(exp.start_date);
  const ee = es + Number(exp.days) - 1;
  const ts = dayNum(deal.legs[0].date);
  const te = dayNum(deal.end_date);
  if (te < es - tol.before || ts > ee + tol.after) return null;
  const ec = cityOf(exp.city);
  if (!ec) return null;

  let best: { city: string; km: number } | null = null;
  for (const l of deal.legs) {
    const c = cityOf(l.city);
    if (!c) continue;
    const dist = l.city === exp.city ? 0 : Math.round(kmBetween(c, ec));
    if (dist <= tol.radiusKm && (!best || dist < best.km)) best = { city: l.city, km: dist };
  }
  if (!best) return null;

  const exactCity = best.km === 0;
  const startDiff = es - ts;
  const exactDates = startDiff >= 0 && startDiff <= 1;
  const route = deal.legs.map((l) => `${l.city} (${dm(l.date)})`).join(" → ");
  const cityTxt = exactCity
    ? `${exp.city} está no roteiro`
    : `${best.city} fica a ${best.km} km de ${exp.city}`;
  const dateTxt = exactDates
    ? `datas compatíveis com o início em ${dm(exp.start_date)}`
    : startDiff > 0
      ? `a viagem começa ${startDiff} dias antes da expedição (${dm(exp.start_date)})`
      : `a viagem começa ${-startDiff} dia(s) após o início da expedição (${dm(exp.start_date)})`;
  return {
    approx: !exactCity || !exactDates,
    score: 100 - best.km / 10 - Math.abs(startDiff) * 3,
    reason: `Roteiro ${route}: ${cityTxt}; ${dateTxt}.`,
  };
}

// ---------------------------------------------------------------- Resolução

export type FlagKey = "aprox" | "multi" | "nenhuma" | "fora" | "passageiro" | "titular";
export type Flag = { key: FlagKey; label: string; tone: Tone };

// Sinalizações informativas não geram pendência de conferência.
const INFORMATIVE: FlagKey[] = ["passageiro"];

export type Registered = { passenger: Passenger; client: Client };

export type Resolved = {
  deal: Deal;
  partner: Partner | null;
  exp: Expedition | null;
  flags: Flag[];
  reason: string;
  manual: boolean;
  candIds: string[];
  com: Money;
  needsReview: boolean;
  // Passageiros cadastrados na lista da expedição vinculada (titular primeiro)
  registered: Registered[];
  // Passageiros sem cadastro na lista (identidade só para a Vay; o parceiro não recebe esses dados)
  unregistered: Passenger[];
  // Quantos passageiros do negócio não estão na lista (vale para Vay e parceiro)
  unregisteredCount: number;
  // Cliente da linha principal: o titular, se cadastrado; senão o primeiro cadastrado
  primaryClientId: string | null;
};

// Titular primeiro, depois a ordem de associação.
export function sortPassengers(ps: Passenger[]): Passenger[] {
  return [...ps].sort(
    (a, b) => Number(b.is_titular) - Number(a.is_titular) || a.position - b.position || a.name.localeCompare(b.name),
  );
}

// Liga os passageiros do negócio aos clientes da lista de uma expedição.
export function linkPassengers(deal: Deal, expClients: Client[]) {
  const registered: Registered[] = [];
  const unregistered: Passenger[] = [];
  for (const p of sortPassengers(deal.passengers ?? [])) {
    const c = expClients.find((x) => samePerson(x, p));
    if (c) registered.push({ passenger: p, client: c });
    else unregistered.push(p);
  }
  const total = Math.max(Number(deal.passenger_count) || 0, deal.passengers?.length ?? 0);
  const titular = registered.find((r) => r.passenger.is_titular);
  const first = [...registered].sort((a, b) => (a.client.created_at < b.client.created_at ? -1 : 1))[0];
  return {
    registered,
    unregistered,
    unregisteredCount: Math.max(0, total - registered.length),
    primaryClientId: (titular ?? first)?.client.id ?? null,
  };
}

export function resolveDeals(
  deals: Deal[],
  partners: Partner[],
  exps: Expedition[],
  clients: Client[],
  tol: Tolerances = DEFAULT_TOL,
): Resolved[] {
  const byAfiliado = new Map(partners.map((p) => [p.afiliado, p]));
  const expById = new Map(exps.map((e) => [e.id, e]));

  return deals.map((d) => {
    const p = byAfiliado.get(d.afiliado) ?? null;
    const r: Resolved = {
      deal: d,
      partner: p,
      exp: null,
      flags: [],
      reason: "",
      manual: false,
      candIds: [],
      com: ZERO,
      needsReview: false,
      registered: [],
      unregistered: [],
      unregisteredCount: 0,
      primaryClientId: null,
    };

    if (d.override_none || d.override_expedition_id) {
      r.manual = true;
      const ov = d.override_expedition_id ? expById.get(d.override_expedition_id) : undefined;
      if (!d.override_none && ov) {
        r.exp = ov;
        r.reason = "Atribuído manualmente pela Vay Agora.";
      } else {
        r.reason = "Marcado manualmente como fora de expedição — não remunera.";
      }
    } else {
      const cands = p
        ? exps
            .filter((e) => e.partner_id === p.id)
            .map((e) => ({ e, m: evalDeal(d, e, tol) }))
            .filter((x): x is { e: Expedition; m: Match } => !!x.m)
            .sort((a, b) => b.m.score - a.m.score)
        : [];
      if (cands.length) {
        r.exp = cands[0].e;
        r.reason = cands[0].m.reason;
        r.candIds = cands.map((x) => x.e.id);
        if (cands[0].m.approx)
          r.flags.push({ key: "aprox", label: "Vínculo por aproximação", tone: "bluebell" });
        if (cands.length > 1)
          r.flags.push({ key: "multi", label: "Mais de uma expedição possível", tone: "yellow" });
      } else {
        r.reason = p
          ? `Nenhuma expedição de ${p.name} combina com as datas e o destino desta viagem.`
          : "Afiliado não corresponde a nenhum parceiro cadastrado.";
        r.flags.push({ key: "nenhuma", label: "Nenhuma expedição encontrada", tone: "red" });
      }
    }

    if (r.exp) {
      const expId = r.exp.id;
      Object.assign(r, linkPassengers(d, clients.filter((c) => c.expedition_id === expId)));
      // Basta um passageiro estar na lista para o negócio contar como "na lista".
      if (r.registered.length === 0)
        r.flags.push({ key: "fora", label: "Cliente fora da lista do parceiro", tone: "yellow" });
      else if (r.unregisteredCount > 0)
        r.flags.push({ key: "passageiro", label: "Passageiro não cadastrado", tone: "neutral" });
      r.com = dealCom(d);
    }
    if (d.titular_labeled === false)
      r.flags.push({ key: "titular", label: "Titular não definido", tone: "yellow" });

    r.needsReview = !d.reviewed && r.flags.some((f) => !INFORMATIVE.includes(f.key));
    return r;
  });
}
