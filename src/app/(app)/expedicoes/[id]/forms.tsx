"use client";

import { useRef, useState, useTransition } from "react";
import { finishExpedition, type FormState } from "../../actions";

// Vay: confirma que a expedição aconteceu e libera os créditos no extrato do parceiro (não tem volta).
export function FinishExpedition({ expId, expName, total, deals }: { expId: string; expName: string; total: string; deals: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<FormState>(undefined);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const r = await finishExpedition(expId);
      setState(r);
      if (r?.ok) ref.current?.close();
    });
  return (
    <>
      <button type="button" className="btn primary" onClick={() => ref.current?.showModal()}>
        Finalizar expedição
      </button>
      {state?.error ? <div className="error" role="alert">{state.error}</div> : null}
      <dialog ref={ref} className="modal" aria-labelledby="fin-title" style={{ width: "min(480px, calc(100vw - 32px))" }}>
        <div className="modal-head">
          <h2 id="fin-title" className="section-title">Finalizar {expName}?</h2>
          <button type="button" className="btn ghost sm" onClick={() => ref.current?.close()}>Fechar</button>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <p>
            Confirme que a expedição aconteceu corretamente. O ganho de <strong>{total}</strong> ({deals}{" "}
            {deals === 1 ? "negócio" : "negócios"}) fica registrado como valor apurado desta expedição.
          </p>
          <p className="small muted">
            Depois, lance esse valor em créditos no HubSpot (objeto Créditos da empresa da agência): ele aparece no
            extrato do parceiro na próxima sincronização. O valor apurado fica congelado.
          </p>
          {state?.error ? <div className="error" role="alert">{state.error}</div> : null}
          <div className="row">
            <button type="button" className="btn primary" disabled={pending} onClick={run}>
              {pending ? "Finalizando…" : "Confirmar e finalizar"}
            </button>
            <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>Cancelar</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
