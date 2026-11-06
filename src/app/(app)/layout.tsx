import { Sidebar } from "@/components/Sidebar";
import { requireSession } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const name = s.isVay
    ? s.profile.full_name || "Equipe Vay Agora"
    : s.partner?.name || s.profile.full_name || "Parceiro";
  return (
    <div className="shell">
      <Sidebar isVay={s.isVay} name={name} email={s.profile.email} />
      <main className="main">
        <div className="container">
          {!s.isVay && !s.partner ? (
            <div className="error" role="alert">
              Seu acesso ainda não está ligado a uma agência parceira. Fale com a equipe Vay Agora.
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  );
}
