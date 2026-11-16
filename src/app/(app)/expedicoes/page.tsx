import { redirect } from "next/navigation";
import { PartnerDashboard } from "@/components/PartnerDashboard";
import { loadWorld, requireSession } from "@/lib/data";

export const metadata = { title: "Expedições" };

// Aba Expedições do parceiro: ganhos no topo e as expedições logo abaixo (igual à tela do parceiro na Vay).
// A Vay vê as expedições na Visão geral e no painel de cada parceiro.
export default async function ExpeditionsPage({ searchParams }: { searchParams: Promise<{ ano?: string; tri?: string; nova?: string }> }) {
  const s = await requireSession();
  if (s.isVay || !s.partner) redirect("/visao-geral");
  const [world, sp] = await Promise.all([loadWorld(), searchParams]);
  return (
    <PartnerDashboard
      partner={s.partner}
      world={world}
      isVay={false}
      year={sp.ano}
      quarter={sp.tri}
      basePath="/expedicoes"
      newExpedition={!!sp.nova}
    />
  );
}
