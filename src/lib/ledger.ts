// Consolidação dos negócios por expedição e por cliente (SPEC 2.0).
// A lista de clientes de cada expedição são os passageiros dos negócios da agência vinculados a ela
// (qualquer etapa no HubSpot). Não há lista cadastrada no sistema.
// Valores e comissão são do negócio: entram uma única vez, na linha principal (titular), e todo total soma por negócio.
import { addMoney, bestStage, dealStage, PRODUCTS, ZERO, type Money, type Product } from "./commission";
import { foldName, resolveDeals, travellers, type Resolved, type Tolerances } from "./matching";
import type { Deal, Expedition, Partner, Passenger, StageId } from "./types";

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
};

// Mesma pessoa em negócios diferentes: contato do HubSpot; sem ele, nome completo.
export const personKey = (p: Pick<Passenger, "hubspot_contact_id" | "name">) =>
  p.hubspot_contact_id ? `c:${p.hubspot_contact_id}` : `n:${foldName(p.name)}`;

// Linha principal do negócio: o titular, se viaja; senão o primeiro passageiro.
export const primaryOf = (d: Deal): Passenger | undefined => travellers(d)[0];

export class Ledger {
  readonly resolved: Resolved[];
  // Negócios que remuneram: ganhos e vinculados a uma expedição
  readonly paid: Resolved[];

  constructor(deals: Deal[], partners: Partner[], exps: Expedition[], tol?: Tolerances) {
    this.resolved = resolveDeals(deals, partners, exps, tol);
    this.paid = this.resolved.filter((r) => r.exp && r.deal.stage_kind === "won");
  }

  // Negócios ganhos da expedição (os que remuneram)
  dealsForExp(expId: string): Resolved[] {
    return this.paid.filter((r) => r.exp!.id === expId);
  }

  // Todos os negócios da agência vinculados à expedição, em qualquer etapa
  allForExp(expId: string): Resolved[] {
    return this.resolved.filter((r) => r.exp?.id === expId);
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
        const m = primaryOf(r.deal);
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
      });
    }
    return out.sort((a, b) => STAGE_RANK[a.stage] - STAGE_RANK[b.stage] || a.name.localeCompare(b.name, "pt-BR"));
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

  // Pendências (corrigir no HubSpot): não sinalizados desta expedição e negócios do parceiro sem expedição.
  pendingFor(e: Expedition): number {
    return this.resolved.filter(
      (r) =>
        r.needsReview &&
        (r.suggested ? r.suggested.id === e.id : !r.exp && r.deal.signaled !== false && r.partner?.id === e.partner_id),
    ).length;
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

const STAGE_RANK: Record<StageId, number> = { fechado: 0, negociacao: 1, em_contato: 2, perdido: 3 };
