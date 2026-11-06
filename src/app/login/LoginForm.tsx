"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="form">
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" className="input" placeholder="voce@agencia.com.br" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" className="input" placeholder="Sua senha" autoComplete="current-password" required />
      </div>
      {state?.error ? <div className="error" role="alert">{state.error}</div> : null}
      <button type="submit" className="btn primary lg block" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
      <Link href="/esqueci-senha" className="small">Esqueci minha senha</Link>
    </form>
  );
}
