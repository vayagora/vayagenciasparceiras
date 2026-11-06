"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { forgotPassword } from "../login/actions";

export default function ForgotPage() {
  const [state, action, pending] = useActionState(forgotPassword, undefined);
  return (
    <AuthFrame>
      <div className="stack" style={{ gap: 8 }}>
        <h2 style={{ fontSize: 30 }}>Esqueci minha senha</h2>
        <p className="muted">Enviaremos um link para você criar uma nova senha.</p>
      </div>
      <form action={action} className="form">
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" className="input" autoComplete="username" required />
        </div>
        {state?.error ? <div className="error" role="alert">{state.error}</div> : null}
        {state?.ok ? <div className="notice" role="status">{state.ok}</div> : null}
        <button type="submit" className="btn primary lg block" disabled={pending}>Enviar link</button>
        <Link href="/login" className="small">Voltar para o login</Link>
      </form>
    </AuthFrame>
  );
}
