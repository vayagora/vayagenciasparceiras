import { AIRPORTS } from "@/lib/airports";

// Lista de aeroportos para os campos com sugestão (<input list="aeroportos">).
const OPTIONS = Object.entries(AIRPORTS)
  .map(([code, [city]]) => `${code} · ${city}`)
  .sort((a, b) => a.localeCompare(b, "pt-BR"));

export function AirportOptions({ id = "aeroportos" }: { id?: string }) {
  return (
    <datalist id={id}>
      {OPTIONS.map((o) => <option key={o} value={o} />)}
    </datalist>
  );
}

export function airportLabel(code: string | null | undefined): string {
  if (!code) return "";
  const a = AIRPORTS[code];
  return a ? `${code} · ${a[0]}` : code;
}
