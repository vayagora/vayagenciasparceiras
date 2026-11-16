import Link from "next/link";
import { redirect } from "next/navigation";
import { ExpeditionList } from "@/components/ExpeditionList";
import { Badge, Tip } from "@/components/ui";
import { loadWorld, requireSession } from "@/lib/data";
import { NewExpeditionForm } from "./NewExpeditionForm";

export const metadata = { title: "Expedições" };

// Aba Expedições do parceiro (protótipo v37). A Vay vê as expedições na Visão geral e no painel de cada parceiro.
export default async function ExpeditionsPage({ searchParams }: { searchParams: Promise<{ nova?: string }> }) {
  const s = await requireSession();
  if (s.isVay) redirect("/visao-geral");
  const [world, sp] = await Promise.all([loadWorld(), searchParams]);
  const exps = world.exps.filter((e) => e.partner_id === s.partner?.id);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Suas expedições</div>
          <div className="ttl">
            <h1 className="page-title">Expedições</h1>
            <Badge tone="neutral">{exps.length}</Badge>
            <Tip>Inicie uma expedição para cada viagem ou grupo confirmado e cadastre os clientes nela. A Vay Agora entra em contato com eles.</Tip>
          </div>
        </div>
        <Link href="/expedicoes?nova=1#nova-expedicao" className="btn primary">Iniciar expedição</Link>
      </div>

      {sp.nova ? <NewExpeditionForm /> : null}

      <ExpeditionList exps={exps} world={world} isVay={false} showPartner={false} emptyText="Nenhuma expedição por aqui ainda. Use “Iniciar expedição”." />
    </>
  );
}
