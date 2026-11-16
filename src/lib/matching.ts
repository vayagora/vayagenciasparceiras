// Vínculo negócio → expedição (SPEC §4.4) e correspondência cliente ↔ passageiro (SPEC §3).
// Qualquer mudança aqui exige teste em matching.test.ts.
import { AIRPORTS } from "./airports";
import { cityOf, kmBetween } from "./cities";
import { dealCom, paymentKind, withCashback, ZERO, type Money, type Tone } from "./commission";
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

export type FlagKey =
  | "aprox" | "multi" | "nenhuma" | "fora" | "acompanhante" | "titular" | "nao_sinalizado"
  | "credito" | "misto" | "ajustado" | "nome";
export type Flag = { key: FlagKey; label: string; tone: Tone };

// Sinalizações informativas não geram pendência de conferência.
const INFORMATIVE: FlagKey[] = ["credito", "ajustado"];

export type Registered = { passenger: Passenger; client: Client; byName?: boolean };

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
  // Negócio não sinalizado no HubSpot: expedição compatível por destino e data (não remunera)
  suggested: Expedition | null;
  // Comissão que geraria se fosse sinalizado
  potential: Money;
  // Algum passageiro bate com a lista do parceiro (por contato, e-mail, telefone ou nome)
  listEvidence: boolean;
  // O que corrigir no HubSpot
  fixes: string[];
};

const foldName = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Indício mais fraco que samePerson: mesmo nome completo, sem diferenciar acentos, maiúsculas e espaços
// (pelo menos nome e sobrenome; só o primeiro nome não basta). Espelha names_match() da migração 0010.
export function sameName(a: string, b: string): boolean {
  const x = foldName(a);
  return x.includes(" ") && x === foldName(b);
}

// O que falta no HubSpot para o negócio contar como de agência parceira.
export function hubspotFixes(d: Pick<Deal, "hs_origem" | "hs_agency">, partnerName: string, origemValue = "Afiliado"): string[] {
  const out: string[] = [];
  if (d.hs_origem !== origemValue) out.push(`marcar "Origem do Negócio" como "${origemValue}"${d.hs_origem ? ` (hoje: ${d.hs_origem})` : ""}`);
  if (!d.hs_agency) out.push(`associar a empresa "${partnerName}" ao negócio`);
  return out;
}

// Titular primeiro, depois a ordem de associação.
export function sortPassengers(ps: Passenger[]): Passenger[] {
  return [...ps].sort(
    (a, b) => Number(b.is_titular) - Number(a.is_titular) || a.position - b.position || a.name.localeCompare(b.name),
  );
}

// Liga os passageiros do negócio aos clientes da lista de uma expedição.
// 1º contato do HubSpot, e-mail ou telefone (samePerson); 2º, para quem sobrou, o nome completo idêntico
// (byName = true: vai para conferência como "Vinculado pelo nome"). Mesma regra de passenger_visible_to_partner (0010).
export function linkPassengers(deal: Deal, expClients: Client[]) {
  const registered: Registered[] = [];
  const unregistered: Passenger[] = [];
  const used = new Set<string>();
  const pending: Passenger[] = [];
  for (const p of sortPassengers(deal.passengers ?? [])) {
    const c = expClients.find((x) => samePerson(x, p));
    if (c) {
      registered.push({ passenger: p, client: c });
      used.add(c.id);
    } else pending.push(p);
  }
  for (const p of pending) {
    const c = expClients.find((x) => !used.has(x.id) && sameName(x.name, p.name));
    if (c) {
      registered.push({ passenger: p, client: c, byName: true });
      used.add(c.id);
    } else unregistered.push(p);
  }
  registered.sort((a, b) => Number(b.passenger.is_titular) - Number(a.passenger.is_titular) || a.passenger.position - b.passenger.position);
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

// Cashback do negócio (SPEC 1.3): editado pela Vay > forma de pagamento > regras de comissão.
export function cashback(d: Deal): { com: Money; flags: Flag[] } {
  const calc = dealCom(d);
  const kind = paymentKind(d.payment_methods);
  if (d.cashback_override !== null && d.cashback_override !== undefined) {
    return { com: withCashback(calc, Number(d.cashback_override), d), flags: [{ key: "ajustado", label: "Cashback ajustado", tone: "purple" }] };
  }
  if (kind === "credito")
    return { com: { ...ZERO, sold: calc.sold }, flags: [{ key: "credito", label: "Pago com créditos · sem cashback", tone: "neutral" }] };
  if (kind === "misto")
    return { com: { ...ZERO, sold: calc.sold }, flags: [{ key: "misto", label: "Pagamento misto · definir cashback", tone: "yellow" }] };
  return { com: calc, flags: [] };
}

// Cashback calculado pelas regras, sem a edição da Vay (para o histórico e o modal de edição).
export function calculatedCashback(d: Deal): number {
  return cashback({ ...d, cashback_override: null }).com.total;
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
      suggested: null,
      potential: ZERO,
      listEvidence: false,
      fixes: [],
    };

    // Não sinalizado no HubSpot: procura a expedição por destino e data; nunca remunera.
    if (d.signaled === false) {
      const hinted = d.hs_agency ? byAfiliado.get(d.hs_agency) ?? null : null;
      const pool = hinted ? exps.filter((e) => e.partner_id === hinted.id) : exps;
      const best = pool
        .map((e) => ({ e, m: evalDeal(d, e, tol) }))
        .filter((x): x is { e: Expedition; m: Match } => !!x.m)
        .sort((a, b) => b.m.score - a.m.score)[0];
      if (best) {
        const owner = partners.find((p) => p.id === best.e.partner_id) ?? null;
        const expClients = clients.filter((c) => c.expedition_id === best.e.id);
        r.partner = owner;
        r.suggested = best.e;
        r.reason = best.m.reason;
        r.potential = cashback(d).com;
        r.listEvidence = (d.passengers ?? []).some((p) =>
          expClients.some((c) => samePerson(c, p) || sameName(c.name, p.name)),
        );
        r.fixes = hubspotFixes(d, owner?.afiliado ?? "da agência");
        r.flags.push({ key: "nao_sinalizado", label: "Encontrado, mas não sinalizado no HubSpot", tone: "red" });
        r.needsReview = !d.reviewed;
      }
      return r;
    }

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
        // SPEC 1.3: acompanhante que não está na expedição deveria estar em outro negócio.
        r.flags.push({ key: "acompanhante", label: "Acompanhante fora da expedição", tone: "yellow" });
      // Ligado ao cliente só pelo nome (contato, e-mail e telefone não bateram): conferir.
      if (r.registered.some((x) => x.byName))
        r.flags.push({ key: "nome", label: "Vinculado pelo nome", tone: "yellow" });
      const c = cashback(d);
      r.com = c.com;
      r.flags.push(...c.flags);
    }
    if (d.titular_labeled === false)
      r.flags.push({ key: "titular", label: "Titular não definido", tone: "yellow" });

    r.needsReview = !d.reviewed && r.flags.some((f) => !INFORMATIVE.includes(f.key));
    return r;
  });
}
