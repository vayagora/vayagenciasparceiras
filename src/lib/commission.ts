// Regras de comissão: voo 2%, hospedagem 3%, seguro 5%, sobre o valor do negócio (uma vez por negócio).
// O vínculo negócio → expedição fica em matching.ts; os totais, em ledger.ts.
import { dayNum, todayIso } from "./format";
import type { Deal, Expedition, StageId } from "./types";

export const RATES = { voo: 0.02, hotel: 0.03, seguro: 0.05 } as const;
export type Product = keyof typeof RATES;
export const PRODUCTS: Product[] = ["voo", "hotel", "seguro"];
export const PROD_LABEL: Record<Product, string> = {
  voo: "Voo",
  hotel: "Hospedagem",
  seguro: "Seguro viagem",
};

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

export function dealCom(d: Pick<Deal, "voo" | "hotel" | "seguro">): Money {
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
