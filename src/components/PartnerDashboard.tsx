import Link from "next/link";
import type { World } from "@/lib/data";
import type { Partner } from "@/lib/types";
import { NewExpeditionForm } from "@/app/(app)/expedicoes/NewExpeditionForm";
import { EarningsBlock } from "./EarningsBlock";
import { ExpeditionList } from "./ExpeditionList";
import { Badge, Tip } from "./ui";

type Props = {
  partner: Partner;
  world: World;
  isVay: boolean;
  year?: string;
  quarter?: string;
  basePath: string;
  newExpedition?: boolean; // Vay: formulário de nova expedição aberto (?nova=1)
};

// Painel do parceiro (protótipo v37).
// Parceiro: "Olá, {parceiro}" + bloco Ganhos (as expedições ficam na aba própria).
// Vay: cabeçalho com "Acordo de parceria" + bloco Ganhos + seção Expedições do parceiro.
export function PartnerDashboard({ partner, world, isVay, year, quarter, basePath, newExpedition }: Props) {
  const exps = world.exps.filter((e) => e.partner_id === partner.id);
  return (
    <>
      <div className="page-head">
        <div>
          {isVay ? <Link href="/parceiros" className="back">← Todos os parceiros</Link> : null}
          <div className="eyebrow">{isVay ? "Painel do parceiro · visão Vay Agora" : "Painel do parceiro"}</div>
          <div className="ttl">
            <h1 className="page-title">{isVay ? partner.name : `Olá, ${partner.name}`}</h1>
            <Tip>
              {isVay
                ? "Exatamente os ganhos que este parceiro vê no painel dele, mais as expedições."
                : "Acompanhe seus ganhos por período. As expedições ficam na aba Expedições."}
            </Tip>
          </div>
        </div>
        {isVay ? (
          <a href={`/acordo-de-parceria?parceiro=${partner.id}`} target="_blank" rel="noreferrer" className="btn outline">
            Acordo de parceria
          </a>
        ) : null}
      </div>

      <EarningsBlock partner={partner} world={world} isVay={isVay} year={year} quarter={quarter} basePath={basePath} />

      {isVay ? (
        <section className="stack exp-sec" aria-label="Expedições do parceiro">
          <div className="sec-head">
            <div className="ttl">
              <h2 className="section-title">Expedições</h2>
              <Badge tone="neutral">{exps.length}</Badge>
            </div>
            <Link href={`${basePath}?nova=1#nova-expedicao`} className="btn primary sm">Iniciar expedição</Link>
          </div>
          {newExpedition ? <NewExpeditionForm fixedPartnerId={partner.id} cancelHref={basePath} /> : null}
          <ExpeditionList exps={exps} world={world} isVay showPartner={false} emptyText="Este parceiro ainda não tem expedições." />
        </section>
      ) : null}
    </>
  );
}
