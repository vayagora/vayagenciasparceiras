// Consolidação dos negócios por expedição e por cliente (SPEC 2.4).
// - Negócio da agência (origem + empresa) com UM passageiro vai para "Passageiros".
// - Negócio da agência com VÁRIOS passageiros (conjunto) fica em "A conferir" até a Vay aprovar ("Marcar como
//   passageiros"); a aprovação vale para os passageiros daquele momento (mudou a composição, volta a conferir).
// - Negócio não sinalizado que combina com a expedição: "A conferir" (a Vay corrige no HubSpot ou marca como conferido).
// - Passageiro com qualquer pendência na expedição fica inteiro em "A conferir", e quem está no mesmo negócio vai junto.
// Valores e comissão são do negócio: entram uma única vez, na linha principal (titular), e todo total soma por negócio.
import { addMoney, bestStage, dealStage, PRODUCTS, ZERO, type Money, type Product } from "./commission";
import { dealNo, foldName, resolveDeals, travellers, type Resolved, type Tolerances } from "./matching";
import type { Deal, Expedition, ExpeditionApproval, ExpeditionPending, ExpeditionReview, Partner, Passenger, StageId } from "./types";

export type ExpStats = Money & {
  // Pessoas na lista
  n: number;
  // Pessoas com compra concluída
  closed: number;
  // Negócios ganhos vinculados (os que remuneram)
  deals: number;
  stages: Partial<Record<StageId, number>>;
  bought: Record<Product, number>;
};

// Outro passageiro de um mesmo negócio e onde ele está (rastreio entre abas)
export type Mate = { key: string; name: string; dealNo: string; where: "passageiros" | "conferir" | "conferidos" };

// Uma linha da tabela de clientes (uma por passageiro).
export type ClientLine = {
  key: string;
  name: string;
  email: string;
  phone: string;
  stage: StageId;
  // Todos os negócios da pessoa nesta lista (qualquer etapa)
  deals: Resolved[];
  // Negócios cuja linha principal é esta (valores e ganho aparecem aqui)
  primary: Resolved[];
  // Negócios em que a pessoa só está incluída (valores na linha de outro passageiro)
  included: Resolved[];
  // Valores e ganho dos negócios ganhos da linha principal
  values: Record<Product, number>;
  com: Money;
  // Quem comprou, quando foi outra pessoa (rótulo "Comprador" no HubSpot)
  boughtBy: string[];
  // "Observações para parceiro" dos negócios (HubSpot)
  note: string;
  // Negócios conjuntos aprovados pela Vay (para "Voltar para conferência")
  approved: Resolved[];
  mates: Mate[];
  // Agrupamento na tabela: pessoas do mesmo negócio ficam juntas
  group: string;
};

export type PendingReason = "conjunto" | "composicao" | "nao_sinalizado" | "outro";

// Pessoa na conferência (A conferir / Conferidos)
export type ReviewPerson = {
  key: string;
  name: string;
  email: string;
  // Negócios desta pessoa nesta expedição que estão pendentes (ou conferidos)
  deals: Resolved[];
  reasons: PendingReason[];
  // Marcação "Conferido" da Vay (negócio não sinalizado que não é da expedição)
  review: ExpeditionReview | null;
  mates: Mate[];
  group: string;
};

// Mesma pessoa em negócios diferentes: contato do HubSpot; sem ele, nome completo.
export const personKey = (p: Pick<Passenger, "hubspot_contact_id" | "name">) =>
  p.hubspot_contact_id ? `c:${p.hubspot_contact_id}` : `n:${foldName(p.name)}`;

// Negócio da agência que pode ir para a lista: sinalizado e com pelo menos um passageiro que viaja
export const isAgencyDeal = (d: Deal) => d.signaled !== false && travellers(d).length > 0;
export const isJointDeal = (d: Deal) => travellers(d).length > 1;

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

type ExpState = {
  // Pessoas pendentes e por quê
  pending: Map<string, Set<PendingReason>>;
  // Negócios da agência pendentes (não vão para a lista)
  pendingDeals: Set<string>;
};

export class Ledger {
  readonly resolved: Resolved[];
  // Negócios que remuneram: ganhos, da agência, vinculados e fora de pendência
  readonly paid: Resolved[];

  private reviews: ExpeditionReview[];
  private approvals: ExpeditionApproval[];
  // Parceiro: pendências calculadas pelo sistema (ele não vê os negócios não sinalizados)
  private stored: ExpeditionPending[] | null;
  private states = new Map<string, ExpState>();

  constructor(
    deals: Deal[],
    partners: Partner[],
    exps: Expedition[],
    opts: { reviews?: ExpeditionReview[]; approvals?: ExpeditionApproval[]; storedPending?: ExpeditionPending[] | null; tol?: Tolerances } = {},
  ) {
    this.resolved = resolveDeals(deals, partners, exps, opts.tol);
    this.reviews = opts.reviews ?? [];
    this.approvals = opts.approvals ?? [];
    this.stored = opts.storedPending ?? null;
    this.paid = this.resolved.filter((r) => r.exp && r.deal.stage_kind === "won" && isAgencyDeal(r.deal) && !this.state(r.exp.id).pendingDeals.has(r.deal.id));
  }

  // Negócios da agência vinculados à expedição (qualquer etapa)
  agencyDeals(expId: string): Resolved[] {
    return this.resolved.filter((r) => r.exp?.id === expId && isAgencyDeal(r.deal));
  }

  // Negócios não sinalizados que combinam com a expedição
  private unsignaled(expId: string): Resolved[] {
    return this.resolved.filter((r) => r.suggested?.id === expId);
  }

  approvalOf(expId: string, dealId: string): ExpeditionApproval | undefined {
    return this.approvals.find((a) => a.expedition_id === expId && a.deal_id === dealId);
  }

  private conferred(expId: string): Map<string, ExpeditionReview> {
    return new Map(this.reviews.filter((x) => x.expedition_id === expId).map((x) => [x.person_key, x]));
  }

  // Pendências da expedição, com propagação: pessoa pendente puxa os negócios dela, que puxam quem está neles.
  private state(expId: string): ExpState {
    const cached = this.states.get(expId);
    if (cached) return cached;
    const pending = new Map<string, Set<PendingReason>>();
    const add = (k: string, why: PendingReason) => pending.set(k, (pending.get(k) ?? new Set()).add(why));
    const pendingDeals = new Set<string>();
    const agency = this.agencyDeals(expId);

    if (this.stored) {
      // Parceiro: usa o que o sistema calculou (as pendências vindas de negócios não sinalizados ele não enxerga)
      for (const x of this.stored.filter((p) => p.expedition_id === expId)) add(x.person_key, "outro");
    } else {
      const conf = this.conferred(expId);
      for (const r of this.unsignaled(expId))
        for (const p of travellers(r.deal)) if (!conf.has(personKey(p))) add(personKey(p), "nao_sinalizado");
      for (const r of agency) {
        if (!isJointDeal(r.deal)) continue;
        const keys = travellers(r.deal).map(personKey);
        const a = this.approvalOf(expId, r.deal.id);
        const why: PendingReason | null = !a ? "conjunto" : !sameSet(a.passenger_keys, keys) ? "composicao" : null;
        if (why) {
          pendingDeals.add(r.deal.id);
          for (const k of keys) add(k, why);
        }
      }
    }
    // Propagação até estabilizar
    for (let changed = true; changed; ) {
      changed = false;
      for (const r of agency) {
        if (pendingDeals.has(r.deal.id)) continue;
        const keys = travellers(r.deal).map(personKey);
        if (keys.some((k) => pending.has(k))) {
          pendingDeals.add(r.deal.id);
          for (const k of keys) if (!pending.has(k)) add(k, "outro");
          changed = true;
        }
      }
    }
    const st = { pending, pendingDeals };
    this.states.set(expId, st);
    return st;
  }

  // Negócios ganhos da expedição (os que remuneram)
  dealsForExp(expId: string): Resolved[] {
    return this.paid.filter((r) => r.exp!.id === expId);
  }

  // Negócios da lista (fora de pendência), em qualquer etapa
  allForExp(expId: string): Resolved[] {
    const st = this.state(expId);
    return this.agencyDeals(expId).filter((r) => !st.pendingDeals.has(r.deal.id));
  }

  // Negócios da agência ainda em "A conferir" (bloqueiam a conclusão da expedição)
  pendingAgencyDeals(expId: string): Resolved[] {
    const st = this.state(expId);
    return this.agencyDeals(expId).filter((r) => st.pendingDeals.has(r.deal.id));
  }

  // Passageiros pendentes de negócios da agência (o que o parceiro vê em "Pendências de lançamento")
  agencyPendingPeople(expId: string): { key: string; name: string }[] {
    const out = new Map<string, string>();
    for (const r of this.pendingAgencyDeals(expId)) for (const p of travellers(r.deal)) out.set(personKey(p), p.name);
    return [...out].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  private matesOf(key: string, deals: Resolved[], expId: string): Mate[] {
    const st = this.state(expId);
    const conf = this.conferred(expId);
    const out: Mate[] = [];
    for (const r of deals)
      for (const p of travellers(r.deal)) {
        const k = personKey(p);
        if (k === key || out.some((x) => x.key === k)) continue;
        const where = st.pending.has(k) ? "conferir" : conf.has(k) && r.deal.signaled === false ? "conferidos" : "passageiros";
        out.push({ key: k, name: p.name, dealNo: dealNo(r.deal), where });
      }
    return out;
  }

  // Grupo = o primeiro negócio conjunto da pessoa; sozinha, a própria pessoa
  private groupOf(key: string, deals: Resolved[]): string {
    const joint = deals.filter((r) => isJointDeal(r.deal)).sort((a, b) => (a.deal.id < b.deal.id ? -1 : 1))[0];
    return joint ? `d:${joint.deal.id}` : key;
  }

  // Conferência (só Vay): "A conferir" = pessoas pendentes; "Conferidos" = marcadas como conferidas (não sinalizado).
  reviewQueue(e: Expedition): { pending: ReviewPerson[]; done: ReviewPerson[] } {
    const st = this.state(e.id);
    const conf = this.conferred(e.id);
    const byKey = new Map<string, ReviewPerson>();
    const touch = (p: { key: string; name: string; email: string }, r: Resolved) => {
      const cur = byKey.get(p.key) ?? { ...p, deals: [], reasons: [], review: null, mates: [], group: p.key };
      if (!cur.deals.includes(r)) cur.deals.push(r);
      byKey.set(p.key, cur);
    };
    for (const r of this.pendingAgencyDeals(e.id))
      for (const p of travellers(r.deal)) touch({ key: personKey(p), name: p.name, email: p.email }, r);
    for (const r of this.unsignaled(e.id)) {
      const ps = travellers(r.deal);
      if (!ps.length) touch({ key: `d:${r.deal.id}`, name: "Negócio sem passageiros", email: "" }, r);
      for (const p of ps) {
        const k = personKey(p);
        if (st.pending.has(k) || conf.has(k)) touch({ key: k, name: p.name, email: p.email }, r);
      }
    }
    const all = [...byKey.values()];
    for (const p of all) {
      p.reasons = [...(st.pending.get(p.key) ?? [])];
      if (p.key.startsWith("d:")) p.reasons = ["nao_sinalizado"];
      p.review = conf.get(p.key) ?? null;
      p.mates = this.matesOf(p.key, p.deals, e.id);
      p.group = this.groupOf(p.key, p.deals);
    }
    const sorted = sortGrouped(all);
    const listed = new Set(this.lines(e).map((l) => l.key));
    return {
      pending: sorted.filter((p) => st.pending.has(p.key) || (p.key.startsWith("d:") && !p.review)),
      done: sorted.filter((p) => !st.pending.has(p.key) && p.review && !listed.has(p.key)),
    };
  }

  // Ganho da expedição (soma por negócio)
  earnings(expId: string): Money {
    return this.dealsForExp(expId).reduce((a, r) => addMoney(a, r.com), ZERO);
  }

  lines(e: Expedition): ClientLine[] {
    const byKey = new Map<string, { p: Passenger; deals: Resolved[] }>();
    for (const r of this.allForExp(e.id)) {
      for (const p of travellers(r.deal)) {
        const k = personKey(p);
        const cur = byKey.get(k);
        if (cur) {
          if (!cur.deals.includes(r)) cur.deals.push(r);
        } else byKey.set(k, { p, deals: [r] });
      }
    }
    const out: ClientLine[] = [];
    for (const [key, { p, deals }] of byKey) {
      const primary = deals.filter((r) => {
        const m = travellers(r.deal)[0];
        return !!m && personKey(m) === key;
      });
      const included = deals.filter((r) => !primary.includes(r));
      const wonPrimary = primary.filter((r) => r.deal.stage_kind === "won");
      const values = { voo: 0, hotel: 0, seguro: 0 } as Record<Product, number>;
      for (const r of wonPrimary) for (const k of PRODUCTS) values[k] += Number(r.deal[k]) || 0;
      const ordered = [...deals].sort((a, b) => STAGE_RANK[dealStage(a.deal)] - STAGE_RANK[dealStage(b.deal)]);
      out.push({
        key,
        name: p.name,
        email: p.email,
        phone: p.phone,
        stage: bestStage(deals.map((r) => dealStage(r.deal))),
        deals: ordered,
        primary,
        included,
        values,
        com: wonPrimary.reduce((a, r) => addMoney(a, r.com), ZERO),
        boughtBy: [
          ...new Set(
            deals.flatMap((r) => {
              const me = r.deal.passengers.find((x) => personKey(x) === key);
              const buyer = r.deal.passengers.find((x) => x.is_buyer);
              return buyer && me && !me.is_buyer && personKey(buyer) !== key ? [buyer.name] : [];
            }),
          ),
        ],
        note: [...new Set(ordered.map((r) => (r.deal.partner_note ?? "").trim()).filter(Boolean))].join("\n\n"),
        approved: deals.filter((r) => isJointDeal(r.deal)),
        mates: this.matesOf(key, deals, e.id),
        group: this.groupOf(key, deals),
      });
    }
    return sortGrouped(out);
  }

  expStats(e: Expedition): ExpStats {
    const ls = this.lines(e);
    const ds = this.dealsForExp(e.id);
    const t: ExpStats = {
      ...this.earnings(e.id),
      n: ls.length,
      closed: 0,
      deals: ds.length,
      stages: {},
      bought: { voo: 0, hotel: 0, seguro: 0 },
    };
    for (const l of ls) {
      t.stages[l.stage] = (t.stages[l.stage] ?? 0) + 1;
      if (l.stage === "fechado") t.closed++;
      for (const k of PRODUCTS) if (l.deals.some((r) => r.deal.stage_kind === "won" && Number(r.deal[k]) > 0)) t.bought[k]++;
    }
    return t;
  }

  // Pendências da expedição: pessoas em "A conferir"
  pendingFor(e: Expedition): number {
    return this.reviewQueue(e).pending.length;
  }

  // Negócios encontrados por destino e data para a expedição, mas não sinalizados no HubSpot (só Vay).
  unsignaledFor(e: Expedition): Resolved[] {
    return this.unsignaled(e.id).sort((a, b) => b.potential.total - a.potential.total);
  }

  // Negócios da agência sem expedição compatível (só Vay)
  withoutExpedition(partnerId: string): Resolved[] {
    return this.resolved.filter((r) => r.deal.signaled !== false && !r.exp && r.needsReview && r.partner?.id === partnerId);
  }
}

// Ordem alfabética, com as pessoas do mesmo negócio juntas (o grupo entra na posição do primeiro nome dele).
export function sortGrouped<T extends { name: string; group: string }>(items: T[]): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "pt-BR");
  const groups = new Map<string, T[]>();
  for (const it of [...items].sort(byName)) groups.set(it.group, [...(groups.get(it.group) ?? []), it]);
  return [...groups.values()].flat();
}

const STAGE_RANK: Record<StageId, number> = { fechado: 0, negociacao: 1, em_contato: 2, perdido: 3 };
