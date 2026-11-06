// Regras de comissão e de vínculo negócio → expedição (portadas do protótipo).
import { cityOf, kmBetween } from "./cities";
import { dayNum, dm, lower, todayIso } from "./format";
import type { Client, Deal, Expedition, Partner, StageId } from "./types";

export const RATES = { voo: 0.02, hotel: 0.03, seguro: 0.05 } as const;
export type Product = keyof typeof RATES;
export const PRODUCTS: Product[] = ["voo", "hotel", "seguro"];
export const PROD_LABEL: Record<Product, string> = {
  voo: "Voo",
  hotel: "Hospedagem",
  seguro: "Seguro viagem",
};

// Janela de datas e raio para vincular um negócio a uma expedição
export const TOL_BEFORE = 7;
export const TOL_AFTER = 3;
export const RADIUS_KM = 700;

export type Tone = "neutral" | "bluebell" | "blue" | "purple" | "red" | "yellow" | "success";

export const STAGES: { id: StageId; label: string; tone: Tone; color: string }[] = [
  { id: "novo", label: "Aguardando contato", tone: "neutral", color: "#CBCCD6" },
  { id: "contato", label: "Em contato", tone: "bluebell", color: "#ACB4ED" },
  { id: "proposta", label: "Proposta enviada", tone: "blue", color: "#0078D0" },
  { id: "fechado", label: "Compra concluída", tone: "purple", color: "#473690" },
  { id: "desistiu", label: "Desistiu", tone: "red", color: "#E88A86" },
];

export function stageOf(id: string) {
  return STAGES.find((s) => s.id === id) ?? STAGES[0];
}

export const RULE_TIP = `O sistema vincula cada negócio pelo afiliado + data + destino: de ${TOL_BEFORE} dias antes a ${TOL_AFTER} dias depois da expedição, com a cidade da expedição em algum trecho ou uma cidade a até ${RADIUS_KM} km. Negócios do parceiro sem expedição aparecem aqui para vínculo manual.`;

export type Money = { voo: number; hotel: number; seguro: number; total: number; sold: number };
export const ZERO: Money = { voo: 0, hotel: 0, seguro: 0, total: 0, sold: 0 };

export function addMoney(a: Money, b: Money): Money {
  return {
    voo: a.voo + b.voo,
    hotel: a.hotel + b.hotel,
    seguro: a.seguro + b.seguro,
    total: a.total + b.total,
    sold: a.sold + b.sold,
  };
}

export function dealCom(d: Deal): Money {
  const voo = Number(d.voo) || 0;
  const hotel = Number(d.hotel) || 0;
  const seguro = Number(d.seguro) || 0;
  const c = { voo: voo * RATES.voo, hotel: hotel * RATES.hotel, seguro: seguro * RATES.seguro };
  return { ...c, total: c.voo + c.hotel + c.seguro, sold: voo + hotel + seguro };
}

export function expEnd(e: Expedition): string {
  const d = new Date((dayNum(e.start_date) + Number(e.days) - 1) * 86400000);
  return d.toISOString().slice(0, 10);
}

export function isDone(e: Expedition): boolean {
  return dayNum(e.start_date) + Number(e.days) - 1 < dayNum(todayIso());
}

export function expStatus(e: Expedition): { label: string; tone: Tone } {
  const diff = dayNum(e.start_date) - dayNum(todayIso());
  if (diff > 1) return { label: `Começa em ${diff} dias`, tone: "purple" };
  if (diff === 1) return { label: "Começa amanhã", tone: "purple" };
  if (diff > -Number(e.days)) return { label: "Em andamento", tone: "blue" };
  return { label: "Concluída", tone: "neutral" };
}

type Match = { approx: boolean; score: number; reason: string };

// Afiliado já filtrado antes; aqui avalia data + destino com as tolerâncias.
export function evalDeal(deal: Deal, exp: Expedition): Match | null {
  if (!deal.legs?.length) return null;
  const es = dayNum(exp.start_date);
  const ee = es + Number(exp.days) - 1;
  const ts = dayNum(deal.legs[0].date);
  const te = dayNum(deal.end_date);
  if (te < es - TOL_BEFORE || ts > ee + TOL_AFTER) return null;
  const ec = cityOf(exp.city);
  if (!ec) return null;

  let best: { city: string; km: number } | null = null;
  for (const l of deal.legs) {
    const c = cityOf(l.city);
    if (!c) continue;
    const dist = l.city === exp.city ? 0 : Math.round(kmBetween(c, ec));
    if (dist <= RADIUS_KM && (!best || dist < best.km)) best = { city: l.city, km: dist };
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

export type FlagKey = "aprox" | "multi" | "nenhuma" | "fora";
export type Flag = { key: FlagKey; label: string; tone: Tone };

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
};

export function resolveDeals(
  deals: Deal[],
  partners: Partner[],
  exps: Expedition[],
  clients: Client[],
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
            .map((e) => ({ e, m: evalDeal(d, e) }))
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
      const inList = clients.some(
        (c) => c.expedition_id === expId && lower(c.email) === lower(d.email),
      );
      if (!inList)
        r.flags.push({ key: "fora", label: "Cliente fora da lista do parceiro", tone: "yellow" });
      r.com = dealCom(d);
    }
    r.needsReview = r.flags.length > 0 && !d.reviewed;
    return r;
  });
}

// Visão consolidada: o que o painel precisa saber de cada expedição.
export type ExpStats = Money & {
  n: number;
  closed: number;
  deals: number;
  stages: Partial<Record<StageId, number>>;
  bought: Record<Product, number>;
  clients: Client[];
};

export class Ledger {
  readonly resolved: Resolved[];
  readonly paid: Resolved[];
  private clients: Client[];

  constructor(deals: Deal[], partners: Partner[], exps: Expedition[], clients: Client[]) {
    this.clients = clients;
    this.resolved = resolveDeals(deals, partners, exps, clients);
    this.paid = this.resolved.filter((r) => r.exp);
  }

  dealsForExp(expId: string): Resolved[] {
    return this.paid.filter((r) => r.exp!.id === expId);
  }

  clientDeals(c: Client): Resolved[] {
    if (!c.email) return [];
    return this.paid.filter(
      (r) => r.exp!.id === c.expedition_id && lower(r.deal.email) === lower(c.email),
    );
  }

  // Um negócio fechado no HubSpot prevalece sobre a etapa registrada à mão.
  shownStage(c: Client): StageId {
    return this.clientDeals(c).length ? "fechado" : c.stage;
  }

  expStats(e: Expedition): ExpStats {
    const ds = this.dealsForExp(e.id);
    const cl = this.clients.filter((c) => c.expedition_id === e.id);
    const money = ds.reduce((a, r) => addMoney(a, r.com), ZERO);
    const t: ExpStats = {
      ...money,
      n: cl.length,
      closed: 0,
      deals: ds.length,
      stages: {},
      bought: { voo: 0, hotel: 0, seguro: 0 },
      clients: cl,
    };
    for (const c of cl) {
      const st = this.shownStage(c);
      t.stages[st] = (t.stages[st] ?? 0) + 1;
      if (st === "fechado") t.closed++;
      const cd = this.clientDeals(c);
      for (const k of PRODUCTS) if (cd.some((r) => Number(r.deal[k]) > 0)) t.bought[k]++;
    }
    return t;
  }

  // Pendências de conferência: por expedição, e negócios sem expedição por parceiro.
  pendingFor(e: Expedition): number {
    return this.resolved.filter(
      (r) =>
        r.needsReview &&
        ((r.exp && r.exp.id === e.id) || (!r.exp && r.partner?.id === e.partner_id)),
    ).length;
  }
}
