import { redirect } from "next/navigation";
import { requireSession } from "@/lib/data";

export default async function Home() {
  const s = await requireSession();
  redirect(s.isVay ? "/visao-geral" : "/painel");
}
