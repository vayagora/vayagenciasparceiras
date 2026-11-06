import { redirect } from "next/navigation";
import { PartnerDashboard } from "@/components/PartnerDashboard";
import { loadWorld, requireSession } from "@/lib/data";

export const metadata = { title: "Painel" };

export default async function PainelPage({ searchParams }: { searchParams: Promise<{ ano?: string; tri?: string }> }) {
  const s = await requireSession();
  if (s.isVay) redirect("/visao-geral");
  const [world, sp] = await Promise.all([loadWorld(), searchParams]);
  return <PartnerDashboard partner={s.partner!} world={world} isVay={false} year={sp.ano} quarter={sp.tri} basePath="/painel" />;
}
