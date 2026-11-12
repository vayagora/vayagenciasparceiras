import { redirect } from "next/navigation";
import { BalanceStatement } from "@/components/BalanceStatement";
import { buildStatement } from "@/lib/balance";
import { loadWorld, requireSession } from "@/lib/data";

export const metadata = { title: "Extrato" };

export default async function ExtratoPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const s = await requireSession();
  if (s.isVay || !s.partner) redirect("/parceiros");
  const [world, sp] = await Promise.all([loadWorld(), searchParams]);
  const filter = sp.f === "in" || sp.f === "out" ? sp.f : "all";
  return (
    <BalanceStatement
      partner={s.partner}
      statement={buildStatement(s.partner, world.ledger, world.entries)}
      isVay={false}
      basePath="/extrato"
      filter={filter}
    />
  );
}
