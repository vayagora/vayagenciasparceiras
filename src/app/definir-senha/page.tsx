"use client";

import { useActionState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { setPassword } from "../login/actions";

export default function SetPasswordPage() {
  const [state, action, pending] = useActionState(setPassword, undefined);
  return (
    <AuthFrame>
      <div className="stack" style={{ gap: 8 }}>
        <h2 style={{ fontSize: 30 }}>Crie sua senha</h2>
        <p className="muted">Use pelo menos 8 caracteres.</p>
      </div>
      <form action={action} className="form">
        <div className="field">
          <label htmlFor="password">Nova senha</label>
          <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="field">
          <label htmlFor="confirm">Repita a senha</label>
          <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" minLength={8} required />
        </div>
        {state?.error ? <div className="error" role="alert">{state.error}</div> : null}
        <button type="submit" className="btn primary lg block" disabled={pending}>Salvar e entrar</button>
      </form>
    </AuthFrame>
  );
}
