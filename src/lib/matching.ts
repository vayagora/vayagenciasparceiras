// Vínculo negócio → expedição (SPEC §4.4) e identificação dos passageiros (SPEC §3).
// Qualquer mudança aqui exige teste em matching.test.ts.
import { AIRPORTS } from "./airports";
import { cityOf, kmBetween } from "./cities";
import { dealCom, paymentKind, withCashback, ZERO, type Money, type Tone } from "./commission";
import { dayNum, digits, dm, lower } from "./format";
import type { Deal, Expedition, Partner, Passenger } from "./types";

// Tolerâncias padrão (configuráveis por parâmetro)
export const TOL_BEFORE = 7;
export const TOL_AFTER = 3;
export const RADIUS_KM = 700;

export type Tolerances = { before: number; after: number; radiusKm: number };
export const DEFAULT_TOL: Tolerances = { before: TOL_BEFORE, after: TOL_AFTER, radiusKm: RADIUS_KM };

export const RULE_TIP = `O sistema vincula cada negócio pela agência (empresa associada no HubSpot) + data + destino: de ${TOL_BEFORE} dias antes a ${TOL_AFTER} dias depois da expedição, com a cidade da expedição em algum trecho ou uma cidade a até ${RADIUS_KM} km. Para mudar o vínculo, corrija o negócio no HubSpot.`;

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

// Até esta distância do destino, o trecho conta como a própria cidade da expedição (ex.: GRU e São Paulo).
export const EXACT_KM = 60;

// Coordenadas do destino: o aeroporto preferencial de chegada; sem ele, a cidade da lista.
export function expPlace(exp: Pick<Expedition, "city" | "arrival_airport">): { lat: number; lng: number } | undefined {
  const ap = exp.arrival_airport ? AIRPORTS[exp.arrival_airport] : undefined;
  if (ap) return { lat: ap[1], lng: ap[2] };
  return cityOf(exp.city);
}

// Afiliado já filtrado antes; aqui avalia data + destino com as tolerâncias.
export function evalDeal(deal: Pick<Deal, "legs" | "end_date">, exp: Pick<Expedition, "city" | "arrival_airport" | "start_date" | "days">, tol: Tolerances = DEFAULT_TOL): Match | null {
  if (!deal.legs?.length) return null;
  const es = dayNum(exp.start_date);
  const ee = es + Number(exp.days) - 1;
  const ts = dayNum(deal.legs[0].date);
  const te = dayNum(deal.end_date);
  if (te < es - tol.before || ts > ee + tol.after) return null;
  const ec = expPlace(exp);
  if (!ec) return null;

  let best: { city: string; km: number } | null = null;
  for (const l of deal.legs) {
    const c = typeof l.lat === "number" && typeof l.lng === "number" ? { lat: l.lat, lng: l.lng } : cityOf(l.city);
    if (!c) continue;
    let dist = l.city === exp.city ? 0 : Math.round(kmBetween(c, ec));
    if (dist <= EXACT_KM) dist = 0; // mesma região do aeroporto de chegada conta como o destino
    
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

export type FlagKey = "aprox" | "multi" | "nenhuma" | "nao_sinalizado" | "credito" | "misto" | "ajustado";
export type Flag = { key: FlagKey; label: string; tone: Tone };

// Só estes pedem correção no HubSpot (pendência da Vay). Os demais apenas informam.
export const PENDING: FlagKey[] = ["nenhuma", "nao_sinalizado"];

export type Resolved = {
  deal: Deal;
  partner: Partner | null;
  exp: Expedition | null;
  flags: Flag[];
  reason: string;
  // Expedições compatíveis, da mais provável para a menos
  candIds: string[];
  // Cashback: só negócio ganho vinculado a expedição remunera
  com: Money;
  // Pendência: corrigir no HubSpot (some quando o HubSpot for corrigido)
  needsReview: boolean;
  // Negócio não sinalizado no HubSpot: expedição compatível por destino e data (não remunera)
  suggested: Expedition | null;
  // Comissão que geraria se fosse sinalizado (e ganho)
  potential: Money;
  // O que corrigir no HubSpot
  fixes: string[];
};

// Sem acentos, minúsculo, espaços simples e sem as partículas de/da/do/das/dos/e
export const foldName = (s: string) =>
  ` ${s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()} `
    .replace(/ ((de|da|do|das|dos|e) )+/g, " ")
    .trim();

// Mesmo nome completo, sem diferenciar acentos, maiúsculas, espaços e partículas (só o primeiro nome não basta).
export function sameName(a: string, b: string): boolean {
  const x = foldName(a);
  return x.includes(" ") && x === foldName(b);
}

// O que falta no HubSpot para o negócio contar como de agência parceira.
export function hubspotFixes(d: Pick<Deal, "hs_origem" | "hs_agency">, partnerName: string, origemValue = "Agências Parceiras"): string[] {
  const out: string[] = [];
  const isAgency = ["agencias parceiras", "agencia parceira", "afiliado"].includes(foldName(d.hs_origem));
  if (!isAgency) out.push(`marcar "Origem do Negócio" como "${origemValue}"${d.hs_origem ? ` (hoje: ${d.hs_origem})` : ""}`);
  if (!d.hs_agency) out.push(`associar a empresa "${partnerName}" ao negócio`);
  return out;
}

// Titular primeiro, depois a ordem de associação.
export function sortPassengers(ps: Passenger[]): Passenger[] {
  return [...ps].sort(
    (a, b) => Number(b.is_titular) - Number(a.is_titular) || a.position - b.position || a.name.localeCompare(b.name),
  );
}

// Quem viaja: comprador que não é passageiro (rótulo do HubSpot) não entra na lista.
export function travellers(d: Pick<Deal, "passengers">): Passenger[] {
  return sortPassengers((d.passengers ?? []).filter((p) => p.is_passenger !== false));
}

// Cashback do negócio (SPEC 1.3): valor final definido > forma de pagamento > regras de comissão.
export function cashback(d: Deal): { com: Money; flags: Flag[] } {
  const calc = dealCom(d);
  const kind = paymentKind(d.payment_methods);
  if (d.cashback_override !== null && d.cashback_override !== undefined) {
    return { com: withCashback(calc, Number(d.cashback_override), d), flags: [{ key: "ajustado", label: "Cashback ajustado", tone: "purple" }] };
  }
  if (kind === "credito")
    return { com: { ...ZERO, sold: calc.sold }, flags: [{ key: "credito", label: "Pago com créditos · sem cashback", tone: "neutral" }] };
  if (kind === "misto")
    return { com: { ...ZERO, sold: calc.sold }, flags: [{ key: "misto", label: "Pagamento misto · cashback a definir", tone: "yellow" }] };
  return { com: calc, flags: [] };
}

// Cashback calculado pelas regras, sem valor definido manualmente.
export function calculatedCashback(d: Deal): number {
  return cashback({ ...d, cashback_override: null }).com.total;
}

// Vínculo de cada negócio (SPEC 2.0): sempre automático, pelo parceiro + destino + data.
// Mais de uma expedição possível → a de maior pontuação (destino e datas mais próximos), com aviso só informativo.
export function resolveDeals(deals: Deal[], partners: Partner[], exps: Expedition[], tol: Tolerances = DEFAULT_TOL): Resolved[] {
  const byAfiliado = new Map(partners.map((p) => [p.afiliado, p]));
  const ranked = (pool: Expedition[], d: Deal) =>
    pool
      .map((e) => ({ e, m: evalDeal(d, e, tol) }))
      .filter((x): x is { e: Expedition; m: Match } => !!x.m)
      .sort((a, b) => b.m.score - a.m.score);

  return deals.map((d) => {
    const p = byAfiliado.get(d.afiliado) ?? null;
    const r: Resolved = {
      deal: d,
      partner: p,
      exp: null,
      flags: [],
      reason: "",
      candIds: [],
      com: ZERO,
      needsReview: false,
      suggested: null,
      potential: ZERO,
      fixes: [],
    };

    // Não sinalizado no HubSpot: procura a expedição por destino e data; nunca remunera.
    if (d.signaled === false) {
      const hinted = d.hs_agency ? byAfiliado.get(d.hs_agency) ?? null : null;
      const best = ranked(hinted ? exps.filter((e) => e.partner_id === hinted.id) : exps, d)[0];
      if (best) {
        const owner = partners.find((x) => x.id === best.e.partner_id) ?? null;
        r.partner = owner;
        r.suggested = best.e;
        r.reason = best.m.reason;
        r.potential = d.stage_kind === "won" ? cashback(d).com : ZERO;
        r.fixes = hubspotFixes(d, owner?.afiliado ?? "da agência");
        r.flags.push({ key: "nao_sinalizado", label: "Encontrado, mas não sinalizado no HubSpot", tone: "red" });
        r.needsReview = true;
      }
      return r;
    }

    const cands = p ? ranked(exps.filter((e) => e.partner_id === p.id), d) : [];
    if (cands.length) {
      r.exp = cands[0].e;
      r.reason = cands[0].m.reason;
      r.candIds = cands.map((x) => x.e.id);
      if (cands[0].m.approx) r.flags.push({ key: "aprox", label: "Vínculo por aproximação", tone: "bluebell" });
      if (cands.length > 1)
        r.flags.push({ key: "multi", label: "Mais de uma expedição possível · ficou na mais próxima", tone: "neutral" });
      if (d.stage_kind === "won") {
        const c = cashback(d);
        r.com = c.com;
        r.flags.push(...c.flags);
      }
    } else if (d.stage_kind !== "lost") {
      r.reason = p
        ? `Nenhuma expedição de ${p.name} combina com as datas e o destino desta viagem.`
        : "A empresa associada não corresponde a nenhum parceiro cadastrado.";
      r.flags.push({ key: "nenhuma", label: "Nenhuma expedição encontrada", tone: "red" });
    }
    r.needsReview = r.flags.some((f) => PENDING.includes(f.key));
    return r;
  });
}
