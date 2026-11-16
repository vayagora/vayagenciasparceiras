import { redirect } from "next/navigation";

// O painel do parceiro foi unido à aba Expedições (ganhos no topo, expedições abaixo).
export default async function PainelPage({ searchParams }: { searchParams: Promise<{ ano?: string; tri?: string }> }) {
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1])).toString();
  redirect(q ? `/expedicoes?${q}` : "/expedicoes");
}
