import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/AuthFrame";
import { getSession } from "@/lib/data";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <AuthFrame>
      <div className="stack" style={{ gap: 8 }}>
        <h2 style={{ fontSize: 30 }}>Entrar</h2>
        <p className="muted">Use seu e-mail e senha de acesso. Agências parceiras e equipe Vay Agora entram pelo mesmo lugar.</p>
      </div>
      <LoginForm />
    </AuthFrame>
  );
}
