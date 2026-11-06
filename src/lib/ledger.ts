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
};

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

  // Um negócio fechado no HubSpot prevalece sobre a etapa registrada à mão.
  shownStage(c: Client): StageId {
    return this.clientDeals(c).length ? "fechado" : c.stage;
  }

  clientLine(c: Client): ClientLine {
    const deals = this.clientDeals(c);
    const primary = deals.filter((r) => r.primaryClientId === c.id);
    const included = deals.filter((r) => r.primaryClientId !== c.id);
    const values = { voo: 0, hotel: 0, seguro: 0 } as Record<Product, number>;
    for (const r of primary) for (const k of PRODUCTS) values[k] += Number(r.deal[k]) || 0;
    return {
      client: c,
      stage: deals.length ? "fechado" : c.stage,
      deals,
      primary,
      included,
      values,
      com: primary.reduce((a, r) => addMoney(a, r.com), ZERO),
      hiddenPassengers: primary.reduce((a, r) => a + r.unregisteredCount, 0),
      unregistered: primary.flatMap((r) => r.unregistered.map((passenger) => ({ passenger, deal: r }))),
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
      const st = cd.length ? "fechado" : c.stage;
      t.stages[st] = (t.stages[st] ?? 0) + 1;
      if (st === "fechado") t.closed++;
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
