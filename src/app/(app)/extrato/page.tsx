import { redirect } from "next/navigation";
import { BalanceStatement } from "@/components/BalanceStatement";
import { buildStatement, toRelease } from "@/lib/balance";
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
      statement={buildStatement(s.partner, world.entries, world.exps)}
      toRelease={toRelease(s.partner, world.ledger, world.exps).map((x) => ({ id: x.exp.id, name: x.exp.name, total: x.total }))}
      isVay={false}
      basePath="/extrato"
      filter={filter}
    />
  );
}
