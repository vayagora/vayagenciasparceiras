"use client";

// Filtro de período do bloco "Ganhos": todos os anos (padrão) ou um ano.
import { usePathname, useRouter } from "next/navigation";

type Props = { basePath: string; year: string; years: number[] };

export function PeriodFilter({ basePath, year, years }: Props) {
  const router = useRouter();
  const path = usePathname();
  const go = (y: string) => router.push(y === "all" ? basePath || path : `${basePath || path}?ano=${y}`);
  return (
    <div className="row">
      <label className="sr-only" htmlFor="pf-year">Período</label>
      <select id="pf-year" className="select" style={{ width: "auto" }} value={year} onChange={(e) => go(e.target.value)}>
        <option value="all">Todos os anos</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}
