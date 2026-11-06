// Datas são ISO "AAAA-MM-DD" (colunas date do Postgres). "Hoje" segue o horário de Brasília.

const TZ = "America/Sao_Paulo";

export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function dayNum(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function isoOf(n: number): string {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const p = iso.slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}

export function dm(iso: string): string {
  const p = iso.split("-");
  return `${p[2]}/${p[1]}`;
}

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function brl(v: number): string {
  return (
    "R$ " +
    (Number(v) || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function brlShort(v: number): string {
  v = Number(v) || 0;
  if (v >= 1000)
    return "R$ " + (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  return "R$ " + Math.round(v).toLocaleString("pt-BR");
}

export function lower(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase();
}

export function digits(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "").slice(-11);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---- Trimestres ----

export const QLABEL: Record<number, string> = {
  1: "1º trimestre · jan–mar",
  2: "2º trimestre · abr–jun",
  3: "3º trimestre · jul–set",
  4: "4º trimestre · out–dez",
};

export function quarterOf(iso: string): { y: number; q: number } {
  const [y, m] = iso.split("-").map(Number);
  return { y, q: Math.floor((m - 1) / 3) + 1 };
}

export function lastClosedQuarter(): { y: number; q: number } {
  const cur = quarterOf(todayIso());
  return cur.q === 1 ? { y: cur.y - 1, q: 4 } : { y: cur.y, q: cur.q - 1 };
}
