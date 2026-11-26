import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/data";
import { HomeLanding } from "./(public)/HomeLanding";

const title = "Vay · Programa Empresas Parceiras";
const description =
  "Para empresas que organizam expedições, eventos, intercâmbios e viagens em grupo: a Vay cuida da viagem e sua empresa ganha créditos em cada compra.";

// Página enviada diretamente aos prospects: não deve ser indexada.
export const metadata: Metadata = {
  title: { absolute: title },
  description,
  robots: { index: false, follow: false },
  openGraph: { title, description, type: "website", locale: "pt_BR", siteName: "Vay" },
  twitter: { card: "summary_large_image", title, description },
};

// Com sessão: vai para o painel (Vay → Visão geral; parceiro → Expedições). Sem sessão: home pública.
export default async function Home() {
  const s = await getSession();
  if (s) redirect(s.isVay ? "/visao-geral" : "/expedicoes");
  return <HomeLanding />;
}
