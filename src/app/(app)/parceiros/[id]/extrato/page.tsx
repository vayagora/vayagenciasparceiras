import { notFound } from "next/navigation";
import { BalanceStatement } from "@/components/BalanceStatement";
import { buildStatement } from "@/lib/balance";
import { loadWorld, requireVay } from "@/lib/data";

export const metadata = { title: "Extrato do parceiro" };

export default async function PartnerExtratoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ f?: string }>;
}) {
  await requireVay();
  const [{ id }, sp, world] = await Promise.all([params, searchParams, loadWorld()]);
  const partner = world.partners.find((p) => p.id === id);
  if (!partner) notFound();
  const filter = sp.f === "in" || sp.f === "out" ? sp.f : "all";
  return (
    <BalanceStatement
      partner={partner}
      statement={buildStatement(partner, world.ledger, world.entries)}
      isVay
      basePath={`/parceiros/${id}/extrato`}
      filter={filter}
    />
  );
}
