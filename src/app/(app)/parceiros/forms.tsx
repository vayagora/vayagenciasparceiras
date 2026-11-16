"use client";

import { useActionState, useRef, useEffect } from "react";
import { createPartner, invitePartnerUser, inviteVayUser, type FormState } from "../actions";

function Feedback({ state }: { state: FormState }) {
  if (state?.error) return <div className="error" role="alert">{state.error}</div>;
  if (state?.ok) return <div className="notice" role="status">{state.ok}</div>;
  return null;
}

function useResetOnOk(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

// Botão "Novo parceiro" no cabeçalho, que abre o cadastro num modal (protótipo v37).
export function NewPartnerButton() {
  const dlg = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(createPartner, undefined);
  const ref = useResetOnOk(state);
  useEffect(() => {
    if (state?.ok) dlg.current?.close();
  }, [state]);
  return (
    <>
      <button type="button" className="btn primary" onClick={() => dlg.current?.showModal()}>Novo parceiro</button>
      {state?.ok ? <div className="notice" role="status">{state.ok}</div> : null}
      <dialog ref={dlg} className="modal" aria-labelledby="np-title" style={{ width: "min(560px, calc(100vw - 32px))" }}>
        <div className="modal-head">
          <div className="stack" style={{ gap: 2 }}>
            <h2 id="np-title" className="section-title">Novo parceiro</h2>
            <span className="small muted">Se informar o e-mail, a pessoa recebe um convite para criar a senha e entrar no portal.</span>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => dlg.current?.close()}>Fechar</button>
        </div>
        <form ref={ref} action={action} className="form">
          <div className="field">
            <label htmlFor="np-name">Agência</label>
            <input id="np-name" name="name" className="input" required />
          </div>
          <div className="field">
            <label htmlFor="np-af">Afiliado no HubSpot</label>
            <input id="np-af" name="afiliado" className="input" placeholder="Igual ao nome, se vazio" />
          </div>
          <div className="field">
            <label htmlFor="np-email">E-mail de acesso</label>
            <input id="np-email" name="email" type="email" className="input" placeholder="Opcional · recebe o convite" />
          </div>
          {state?.error ? <div className="error" role="alert">{state.error}</div> : null}
          <div className="row">
            <button type="submit" className="btn primary" disabled={pending}>{pending ? "Cadastrando…" : "Cadastrar parceiro"}</button>
            <button type="button" className="btn ghost" onClick={() => dlg.current?.close()}>Cancelar</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function NewPartnerForm() {
  const [state, action, pending] = useActionState(createPartner, undefined);
  const ref = useResetOnOk(state);
  return (
    <form ref={ref} action={action} className="form">
      <div className="form-grid">
        <div className="field">
          <label htmlFor="np-name">Agência</label>
          <input id="np-name" name="name" className="input" required />
        </div>
        <div className="field">
          <label htmlFor="np-af">Afiliado no HubSpot</label>
          <input id="np-af" name="afiliado" className="input" placeholder="Igual ao nome, se vazio" />
        </div>
        <div className="field">
          <label htmlFor="np-email">E-mail de acesso</label>
          <input id="np-email" name="email" type="email" className="input" placeholder="Opcional · recebe o convite" />
        </div>
        <button type="submit" className="btn primary" disabled={pending}>Cadastrar parceiro</button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function InvitePartnerUser({ partnerId }: { partnerId: string }) {
  const [state, action, pending] = useActionState(invitePartnerUser.bind(null, partnerId), undefined);
  const ref = useResetOnOk(state);
  return (
    <form ref={ref} action={action} className="form">
      <div className="form-grid">
        <div className="field">
          <label htmlFor="ip-email">E-mail</label>
          <input id="ip-email" name="email" type="email" className="input" required />
        </div>
        <button type="submit" className="btn outline" disabled={pending}>Enviar convite</button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function InviteVayUser() {
  const [state, action, pending] = useActionState(inviteVayUser, undefined);
  const ref = useResetOnOk(state);
  return (
    <form ref={ref} action={action} className="form">
      <div className="form-grid">
        <div className="field">
          <label htmlFor="iv-name">Nome</label>
          <input id="iv-name" name="name" className="input" />
        </div>
        <div className="field">
          <label htmlFor="iv-email">E-mail</label>
          <input id="iv-email" name="email" type="email" className="input" required />
        </div>
        <button type="submit" className="btn outline" disabled={pending}>Convidar para a equipe</button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
