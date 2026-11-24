// Consolidação dos negócios por expedição e por cliente (SPEC 2.4).
// "Passageiros" = passageiros dos negócios da agência (origem + empresa), com um ou vários passageiros, vinculados à
// expedição por destino e data (qualquer etapa no HubSpot). Só a sincronização põe alguém aqui.
// A Vay pode marcar um passageiro como ACOMPANHANTE (não é da expedição): ele sai da lista e vai para "Conferidos".
// "A conferir" = passageiros de negócios não sinalizados que combinam com a expedição; a Vay pode marcá-los como conferidos.
// Valores e comissão são do negócio: entram uma única vez, na linha principal (titular, ou o primeiro passageiro que
// continua na lista), e todo total soma por negócio.
import { addMoney, bestStage, dealStage, PRODUCTS, ZERO, type Money, type Product } from "./commission";
import { dealNo, foldName, resolveDeals, travellers, type Resolved, type Tolerances } from "./matching";
import type { Deal, Expedition, ExpeditionReview, Partner, Passenger, StageId } from "./types";

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

// Uma linha da tabela de clientes (uma por passageiro).
export type ClientLine = {
  key: string;
  name: string;
  email: string;
  phone: string;
  stage: StageId;
  // Todos os negócios da pessoa nesta expedição (qualquer etapa)
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
  // Algum negócio desta pessoa tem vários passageiros (conferir se há acompanhante)
  multi: boolean;
  // Outros passageiros dos mesmos negócios (rastreio entre abas)
  mates: Mate[];
  // Agrupamento na tabela: pessoas do mesmo negócio ficam juntas
  group: string;
};

// Outro passageiro do mesmo negócio e onde ele está
export type Mate = { key: string; name: string; dealNo: string; where: "passageiros" | "conferidos" | "conferir" };

// Pessoa na conferência (A conferir / Conferidos)
export type ReviewPerson = {
  key: string;
  name: string;
  email: string;
  // Negócios desta pessoa que pedem conferência nesta expedição
  deals: Resolved[];
  // Por que está aqui: não sinalizado no HubSpot e/ou marcado como acompanhante
  reasons: ("nao_sinalizado" | "acompanhante")[];
  // Marcação da Vay (só em Conferidos)
  review: ExpeditionReview | null;
  // Outros passageiros dos mesmos negócios (rastreio entre abas)
  mates: Mate[];
  group: string;
};

// Negócio que vai para a lista: sinalizado (origem + empresa da agência) e com pelo menos um passageiro que viaja
export const isListDeal = (d: Deal) => d.signaled !== false && travellers(d).length > 0;

// Mesma pessoa em negócios diferentes: contato do HubSpot; sem ele, nome completo.
export const personKey = (p: Pick<Passenger, "hubspot_contact_id" | "name">) =>
  p.hubspot_contact_id ? `c:${p.hubspot_contact_id}` : `n:${foldName(p.name)}`;

// Linha principal do negócio: o titular, se viaja; senão o primeiro passageiro.
export const primaryOf = (d: Deal): Passenger | undefined => travellers(d)[0];

export class Ledger {
  readonly resolved: Resolved[];
  // Negócios que remuneram: ganhos, da lista e vinculados a uma expedição (com alguém que não é acompanhante)
  readonly paid: Resolved[];

  private reviews: ExpeditionReview[];

  constructor(deals: Deal[], partners: Partner[], exps: Expedition[], reviews: ExpeditionReview[] = [], tol?: Tolerances) {
    this.resolved = resolveDeals(deals, partners, exps, tol);
    this.reviews = reviews;
    this.paid = this.resolved.filter((r) => r.exp && r.deal.stage_kind === "won" && isListDeal(r.deal) && this.onList(r.deal, r.exp.id).length > 0);
  }

  // Pessoas marcadas pela Vay nesta expedição (acompanhante ou conferido)
  private marked(expId: string): Map<string, ExpeditionReview> {
    return new Map(this.reviews.filter((x) => x.expedition_id === expId).map((x) => [x.person_key, x]));
  }

  // Passageiros do negócio que ficam na lista da expedição (sem os marcados)
  onList(d: Deal, expId: string): Passenger[] {
    const m = this.marked(expId);
    return travellers(d).filter((p) => !m.has(personKey(p)));
  }

  // Negócios ganhos da expedição (os que remuneram)
  dealsForExp(expId: string): Resolved[] {
    return this.paid.filter((r) => r.exp!.id === expId);
  }

  // Negócios da lista da expedição, em qualquer etapa
  allForExp(expId: string): Resolved[] {
    return this.resolved.filter((r) => r.exp?.id === expId && isListDeal(r.deal));
  }

  // Negócios da lista com vários passageiros (conferir acompanhantes antes de concluir)
  multiDeals(expId: string): Resolved[] {
    return this.allForExp(expId).filter((r) => travellers(r.deal).length > 1);
  }

  // Outros passageiros dos mesmos negócios e onde estão (Passageiros, Conferidos ou A conferir)
  private matesOf(key: string, deals: Resolved[], expId: string): Mate[] {
    const m = this.marked(expId);
    const out: Mate[] = [];
    for (const r of deals)
      for (const p of travellers(r.deal)) {
        const k = personKey(p);
        if (k === key || out.some((x) => x.key === k)) continue;
        const where = m.has(k) ? "conferidos" : r.deal.signaled === false ? "conferir" : "passageiros";
        out.push({ key: k, name: p.name, dealNo: dealNo(r.deal), where });
      }
    return out;
  }

  // Grupo = o primeiro negócio com vários passageiros da pessoa (ordem do HubSpot); sozinho, a própria pessoa
  private groupOf(key: string, deals: Resolved[]): string {
    const multi = deals.filter((r) => travellers(r.deal).length > 1).sort((a, b) => (a.deal.id < b.deal.id ? -1 : 1))[0];
    return multi ? `d:${multi.deal.id}` : key;
  }

  // Conferência da expedição (só Vay): "A conferir" (negócios não sinalizados) e "Conferidos" (marcados pela Vay,
  // inclusive acompanhantes tirados da lista). Quem está em Passageiros não aparece em "A conferir".
  reviewQueue(e: Expedition): { pending: ReviewPerson[]; done: ReviewPerson[] } {
    const listed = new Set(this.lines(e).map((l) => l.key));
    const marks = this.marked(e.id);
    const deals = this.resolved.filter((r) => (r.exp?.id === e.id && isListDeal(r.deal)) || r.suggested?.id === e.id);
    const byKey = new Map<string, ReviewPerson>();
    for (const r of deals) {
      const unsig = r.deal.signaled === false;
      const ps = travellers(r.deal);
      const people = ps.length ? ps.map((p) => ({ key: personKey(p), name: p.name, email: p.email })) : [{ key: `d:${r.deal.id}`, name: "Negócio sem passageiros", email: "" }];
      for (const p of people) {
        // Da lista, só entram aqui os marcados (acompanhantes); dos não sinalizados, todos que não estão na lista
        if (!unsig && !marks.has(p.key)) continue;
        if (unsig && listed.has(p.key)) continue;
        const cur = byKey.get(p.key) ?? { ...p, deals: [], reasons: [], review: null, mates: [], group: p.key };
        if (!cur.deals.includes(r)) cur.deals.push(r);
        const reason = unsig ? "nao_sinalizado" : "acompanhante";
        if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
        byKey.set(p.key, cur);
      }
    }
    const all = [...byKey.values()];
    for (const p of all) {
      p.review = marks.get(p.key) ?? null;
      p.mates = this.matesOf(p.key, p.deals, e.id);
      p.group = this.groupOf(p.key, p.deals);
    }
    const sorted = sortGrouped(all);
    return { pending: sorted.filter((p) => !p.review), done: sorted.filter((p) => p.review) };
  }

  // Ganho da expedição (soma por negócio)
  earnings(expId: string): Money {
    return this.dealsForExp(expId).reduce((a, r) => addMoney(a, r.com), ZERO);
  }

  lines(e: Expedition): ClientLine[] {
    const byKey = new Map<string, { p: Passenger; deals: Resolved[] }>();
    for (const r of this.allForExp(e.id)) {
      for (const p of this.onList(r.deal, e.id)) {
        const k = personKey(p);
        const cur = byKey.get(k);
        if (cur) {
          if (!cur.deals.includes(r)) cur.deals.push(r);
        } else byKey.set(k, { p, deals: [r] });
      }
    }
    const out: ClientLine[] = [];
    for (const [key, { p, deals }] of byKey) {
      // Linha principal do negócio: o primeiro passageiro que continua na lista (titular primeiro)
      const primary = deals.filter((r) => {
        const m = this.onList(r.deal, e.id)[0];
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
        multi: deals.some((r) => travellers(r.deal).length > 1),
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
    return this.resolved.filter((r) => r.suggested?.id === e.id).sort((a, b) => b.potential.total - a.potential.total);
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
