"use client";

import { useRouter } from "next/navigation";
import type { Partner } from "@/lib/types";

export function PartnerFilter({ partners, value }: { partners: Partner[]; value: string }) {
  const router = useRouter();
  return (
    <>
      <label className="sr-only" htmlFor="pf">Filtrar por parceiro</label>
      <select
        id="pf"
        className="select"
        style={{ width: "auto" }}
        value={value}
        onChange={(e) => router.push(e.target.value === "all" ? "/expedicoes" : `/expedicoes?parceiro=${e.target.value}`)}
      >
        <option value="all">Todos os parceiros</option>
        {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </>
  );
}
