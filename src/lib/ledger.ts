// Consolidação dos negócios por expedição e por cliente.
// Valores e comissão são do negócio: entram uma única vez, na linha principal, e todo total soma por negócio.
import { addMoney, PRODUCTS, ZERO, type Money, type Product } from "./commission";
import { resolveDeals, type Resolved, type Tolerances } from "./matching";
import type { Client, Deal, Expedition, Partner, Passenger, StageId } from "./types";

export type ExpStats = Money & {
  n: number;
  closed: number;
  deals: number;
  stages: Partial<Record<StageId, number>>;
  bought: Record<Product, number>;
  clients: Client[];
};

// Uma linha da tabela de clientes (uma por passageiro cadastrado).
export type ClientLine = {
  client: Client;
  stage: StageId;
  // Todos os negócios em que o cliente é passageiro
  deals: Resolved[];
  // Negócios cuja linha principal é esta (valores e ganho aparecem aqui)
  primary: Resolved[];
  // Negócios em que o cliente só está incluído (valores na linha de outro passageiro)
  included: Resolved[];
  values: Record<Product, number>;
  com: Money;
  // Passageiros não cadastrados nos negócios desta linha principal (contagem, sem identidade)
  hiddenPassengers: number;
  // Visão Vay: passageiros não cadastrados, exibidos como linhas próprias logo abaixo
  unregistered: { passenger: Passenger; deal: Resolved }[];
  // Quem comprou, quando foi outra pessoa (rótulo "Comprador" no HubSpot)
  boughtBy: string[];
};

// Etapa exibida (SPEC 1.4): compra concluída no HubSpot > "não contactar"/"comprou em outro lugar" (Vay)
// > em negociação (negócio em aberto no HubSpot) > status do contato marcado pela Vay > não contactado.
export function shownStage(c: Pick<Client, "stage" | "hs_status">, hasLinkedDeal: boolean): StageId {
  if (hasLinkedDeal || c.hs_status === "fechado") return "fechado";
  if (c.stage === "nao_contactar" || c.stage === "outro_lugar") return c.stage;
  if (c.hs_status === "negociacao") return "negociacao";
  if (c.stage === "tentando" || c.stage === "em_contato" || c.stage === "chamar_depois") return c.stage;
  return "novo";
}

export class Ledger {
  readonly resolved: Resolved[];
  readonly paid: Resolved[];
  private clients: Client[];

  constructor(deals: Deal[], partners: Partner[], exps: Expedition[], clients: Client[], tol?: Tolerances) {
    this.clients = clients;
    this.resolved = resolveDeals(deals, partners, exps, clients, tol);
    this.paid = this.resolved.filter((r) => r.exp);
  }

  dealsForExp(expId: string): Resolved[] {
    return this.paid.filter((r) => r.exp!.id === expId);
  }

  // Negócios vinculados à expedição do cliente em que ele é passageiro (titular ou não).
  clientDeals(c: Client): Resolved[] {
    return this.paid.filter(
      (r) => r.exp!.id === c.expedition_id && r.registered.some((x) => x.client.id === c.id),
    );
  }

  shownStage(c: Client): StageId {
    return shownStage(c, this.clientDeals(c).length > 0);
  }

  clientLine(c: Client): ClientLine {
    const deals = this.clientDeals(c);
    const primary = deals.filter((r) => r.primaryClientId === c.id);
    const included = deals.filter((r) => r.primaryClientId !== c.id);
    const values = { voo: 0, hotel: 0, seguro: 0 } as Record<Product, number>;
    for (const r of primary) for (const k of PRODUCTS) values[k] += Number(r.deal[k]) || 0;
    return {
      client: c,
      stage: shownStage(c, deals.length > 0),
      deals,
      primary,
      included,
      values,
      com: primary.reduce((a, r) => addMoney(a, r.com), ZERO),
      hiddenPassengers: primary.reduce((a, r) => a + r.unregisteredCount, 0),
      unregistered: primary.flatMap((r) => r.unregistered.map((passenger) => ({ passenger, deal: r }))),
      boughtBy: [
        ...new Set(
          deals.flatMap((r) => {
            const me = r.registered.find((x) => x.client.id === c.id)?.passenger;
            const buyer = r.deal.passengers.find((p) => p.is_buyer);
            return buyer && me && !me.is_buyer && buyer.id !== me.id ? [buyer.name] : [];
          }),
        ),
      ],
    };
  }

  expStats(e: Expedition): ExpStats {
    const ds = this.dealsForExp(e.id);
    const cl = this.clients.filter((c) => c.expedition_id === e.id);
    // Soma por negócio, nunca por linha.
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
      const cd = this.clientDeals(c);
      const st = shownStage(c, cd.length > 0);
      t.stages[st] = (t.stages[st] ?? 0) + 1;
      if (st === "fechado") t.closed++;
      for (const k of PRODUCTS) if (cd.some((r) => Number(r.deal[k]) > 0)) t.bought[k]++;
    }
    return t;
  }

  // Pendências de conferência: por expedição, e negócios sem expedição por parceiro.
  // Inclui os não sinalizados no HubSpot encontrados para esta expedição.
  pendingFor(e: Expedition): number {
    return this.resolved.filter(
      (r) =>
        r.needsReview &&
        (r.suggested
          ? r.suggested.id === e.id
          : (r.exp && r.exp.id === e.id) || (!r.exp && r.deal.signaled !== false && r.partner?.id === e.partner_id)),
    ).length;
  }

  // Negócios encontrados por destino e data para a expedição, mas não sinalizados no HubSpot (só Vay).
  unsignaledFor(e: Expedition): Resolved[] {
    return this.resolved
      .filter((r) => r.suggested?.id === e.id)
      .sort((a, b) => Number(b.listEvidence) - Number(a.listEvidence) || b.potential.total - a.potential.total);
  }
}
