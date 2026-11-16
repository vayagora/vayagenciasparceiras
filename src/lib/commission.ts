// Regras de comissão (acordo "Regras de Negócio Padrões", item 4.1): passagem aérea 3%, hospedagem 3%,
// seguro viagem 5%, sobre o valor do negócio (uma vez por negócio).
// O vínculo negócio → expedição fica em matching.ts; os totais, em ledger.ts.
import { dayNum, todayIso } from "./format";
import type { Deal, Expedition, StageId } from "./types";

export const RATES = { voo: 0.03, hotel: 0.03, seguro: 0.05 } as const;

// "3%" para exibir
export const pct = (r: number) => `${Math.round(r * 1000) / 10}%`.replace(".", ",");
export type Product = keyof typeof RATES;
export const PRODUCTS: Product[] = ["voo", "hotel", "seguro"];
export const PROD_LABEL: Record<Product, string> = {
  voo: "Voo",
  hotel: "Hospedagem",
  seguro: "Seguro viagem",
};

export type Tone = "neutral" | "bluebell" | "blue" | "purple" | "red" | "yellow" | "success";

// Etapa do cliente, na ordem de prioridade (a maior vale quando a pessoa tem vários negócios).
export const STAGES: { id: StageId; label: string; tone: Tone; color: string }[] = [
  { id: "fechado", label: "Compra concluída", tone: "purple", color: "#473690" },
  { id: "negociacao", label: "Em negociação", tone: "blue", color: "#0078D0" },
  { id: "em_contato", label: "Em contato", tone: "bluebell", color: "#7F8BE0" },
  { id: "perdido", label: "Não comprou", tone: "red", color: "#E88A86" },
];

export function stageOf(id: string) {
  return STAGES.find((s) => s.id === id) ?? STAGES[STAGES.length - 1];
}

// Etapas iniciais do funil no HubSpot (Pré Cotação, Realizar Cotação): "Em contato"
export const CONTACT_HS_STAGES = ["appointmentscheduled", "qualifiedtobuy"];

// Etapa do cliente pela etapa do negócio no HubSpot
export function dealStage(d: Pick<Deal, "stage_kind" | "hs_stage">): StageId {
  if (d.stage_kind === "won") return "fechado";
  if (d.stage_kind === "lost") return "perdido";
  return CONTACT_HS_STAGES.includes(d.hs_stage) ? "em_contato" : "negociacao";
}

// A etapa mais avançada entre vários negócios
export function bestStage(ids: StageId[]): StageId {
  return STAGES.find((s) => ids.includes(s.id))?.id ?? "perdido";
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

// ---------------------------------------------------------------- Forma de pagamento (SPEC 1.3)

export const CREDIT_METHOD = "Crédito na VAY";
export type PaymentKind = "dinheiro" | "credito" | "misto";

// Só "Crédito na VAY" → crédito (sem cashback); crédito + outra forma → misto (a Vay define); senão, dinheiro.
export function paymentKind(methods: string[] | null | undefined): PaymentKind {
  const ms = (methods ?? []).map((m) => m.trim()).filter(Boolean);
  const credit = ms.some((m) => m.toLowerCase() === CREDIT_METHOD.toLowerCase());
  if (!credit) return "dinheiro";
  return ms.length === 1 || ms.every((m) => m.toLowerCase() === CREDIT_METHOD.toLowerCase()) ? "credito" : "misto";
}

// Cashback final: o editado pela Vay distribui-se entre os produtos na proporção do calculado
// (ou do valor vendido, se o calculado for zero), para os totais por produto continuarem coerentes.
export function withCashback(calc: Money, value: number, d: Pick<Deal, "voo" | "hotel" | "seguro">): Money {
  const base = calc.total > 0 ? calc : { voo: Number(d.voo) || 0, hotel: Number(d.hotel) || 0, seguro: Number(d.seguro) || 0, total: 0 };
  const sum = base.total > 0 ? base.total : base.voo + base.hotel + base.seguro;
  const share = (k: "voo" | "hotel" | "seguro") => (sum > 0 ? (base[k] / sum) * value : k === "voo" ? value : 0);
  return { voo: share("voo"), hotel: share("hotel"), seguro: share("seguro"), total: value, sold: calc.sold };
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
