import { notFound } from "next/navigation";
import { PartnerDashboard } from "@/components/PartnerDashboard";
import { loadWorld, requireVay } from "@/lib/data";

export const metadata = { title: "Painel do parceiro" };

export default async function PartnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ano?: string; nova?: string }>;
}) {
  await requireVay();
  const [{ id }, sp, world] = await Promise.all([params, searchParams, loadWorld()]);
  const partner = world.partners.find((p) => p.id === id);
  if (!partner) notFound();
  return (
    <PartnerDashboard
      partner={partner}
      world={world}
      isVay
      year={sp.ano}
      basePath={`/parceiros/${id}`}
      newExpedition={!!sp.nova}
    />
  );
}
