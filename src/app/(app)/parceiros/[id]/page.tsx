import { notFound } from "next/navigation";
import { PartnerDashboard } from "@/components/PartnerDashboard";
import { loadWorld, requireVay } from "@/lib/data";
import { InvitePartnerUser } from "../forms";

export const metadata = { title: "Painel do parceiro" };

export default async function PartnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ano?: string; tri?: string }>;
}) {
  await requireVay();
  const [{ id }, sp, world] = await Promise.all([params, searchParams, loadWorld()]);
  const partner = world.partners.find((p) => p.id === id);
  if (!partner) notFound();
  return (
    <>
      <PartnerDashboard partner={partner} world={world} isVay year={sp.ano} quarter={sp.tri} basePath={`/parceiros/${id}`} />
      <section className="card pad stack">
        <h2 className="section-title">Acesso do parceiro</h2>
        <p className="muted small">
          Afiliado no HubSpot: <strong>{partner.afiliado}</strong>. Convide outra pessoa da agência para acessar o portal.
        </p>
        <InvitePartnerUser partnerId={partner.id} />
      </section>
    </>
  );
}
