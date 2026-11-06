"use client";

import { usePathname, useRouter } from "next/navigation";
import { QLABEL } from "@/lib/format";

type Props = { basePath: string; year: string; quarter: string; years: number[]; isDefault: boolean };

export function PeriodFilter({ basePath, year, quarter, years, isDefault }: Props) {
  const router = useRouter();
  const path = usePathname();
  const go = (y: string, q: string) => router.push(`${basePath || path}?ano=${y}&tri=${q}`);
  return (
    <div className="row">
      <label className="sr-only" htmlFor="pf-year">Ano</label>
      <select id="pf-year" className="select" style={{ width: "auto" }} value={year} onChange={(e) => go(e.target.value, quarter)}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <label className="sr-only" htmlFor="pf-q">Trimestre</label>
      <select id="pf-q" className="select" style={{ width: "auto" }} value={quarter} onChange={(e) => go(year, e.target.value)}>
        <option value="all">Ano inteiro</option>
        {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{QLABEL[q]}</option>)}
      </select>
      {!isDefault ? (
        <button type="button" className="btn ghost sm" onClick={() => router.push(basePath || path)}>
          Último trimestre concluído
        </button>
      ) : null}
    </div>
  );
}
