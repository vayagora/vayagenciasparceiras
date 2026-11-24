"use client";

import { useRef, useState, useTransition } from "react";
import { finishExpedition, reopenExpedition, type FormState } from "../../actions";

// Vay: conclui a expedição (SPEC 2.4). Com negócios de vários passageiros, pede a confirmação de que os
// acompanhantes foram conferidos. Registra o valor apurado; o crédito é lançado no HubSpot.
export function ConcludeExpedition({
  expId,
  expName,
  total,
  deals,
  ended,
  multi,
}: {
  expId: string;
  expName: string;
  total: string;
  deals: number;
  ended: boolean;
  multi: { no: string; names: string[] }[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<FormState>(undefined);
  const [checked, setChecked] = useState(false);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const r = await finishExpedition(expId, checked);
      setState(r);
      if (r?.ok) ref.current?.close();
    });
  const blocked = multi.length > 0 && !checked;
  return (
    <>
      <button type="button" className="btn primary" onClick={() => ref.current?.showModal()}>
        Concluir expedição
      </button>
      {state?.ok ? <div className="notice" role="status">{state.ok}</div> : null}
      <dialog ref={ref} className="modal" aria-labelledby="fin-title" style={{ width: "min(560px, calc(100vw - 32px))" }}>
        <div className="modal-head">
          <h2 id="fin-title" className="section-title">Concluir {expName}?</h2>
          <button type="button" className="btn ghost sm" onClick={() => ref.current?.close()}>Fechar</button>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          {!ended ? (
            <div className="notice" role="status">A data de fim desta expedição ainda não passou.</div>
          ) : null}
          <p>
            Confirme que a expedição aconteceu corretamente. O ganho de <strong>{total}</strong> ({deals}{" "}
            {deals === 1 ? "negócio" : "negócios"}) fica registrado como valor apurado, e o parceiro passa a ver a expedição
            como concluída.
          </p>

          {multi.length ? (
            <div className="note" style={{ borderColor: "var(--yellow-300)", background: "var(--yellow-50)" }}>
              <p className="strong" style={{ color: "var(--text-strong)" }}>
                {multi.length === 1 ? "1 negócio tem" : `${multi.length} negócios têm`} vários passageiros. Confira se algum
                é acompanhante (não é da expedição).
              </p>
              <ul className="agr-list small">
                {multi.map((m) => (
                  <li key={m.no}>
                    <strong>{m.no}</strong>: {m.names.join(", ")}
                  </li>
                ))}
              </ul>
              <p className="small muted">Para tirar um acompanhante, use “É acompanhante” na linha dele, na aba Passageiros.</p>
              <label className="row small" style={{ gap: 8, flexWrap: "nowrap", alignItems: "flex-start" }}>
                <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
                <span>Conferi os negócios com vários passageiros e está tudo certo.</span>
              </label>
            </div>
          ) : null}

          <p className="small muted">
            Depois, lance esse valor em créditos no HubSpot (objeto Créditos da empresa da agência): ele aparece no extrato
            do parceiro na próxima sincronização.
          </p>
          {state?.error ? <div className="error" role="alert">{state.error}</div> : null}
          <div className="row">
            <button type="button" className="btn primary" disabled={pending || blocked} onClick={run}>
              {pending ? "Concluindo…" : "Concluir expedição"}
            </button>
            <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>Cancelar</button>
          </div>
        </div>
      </dialog>
    </>
  );
}

// Vay: reabre uma expedição concluída, com aviso (descarta o valor apurado).
export function ReopenExpedition({ expId, expName }: { expId: string; expName: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<FormState>(undefined);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const r = await reopenExpedition(expId);
      setState(r);
      if (r?.ok) ref.current?.close();
    });
  return (
    <>
      <button type="button" className="btn outline" onClick={() => ref.current?.showModal()}>
        Reabrir expedição
      </button>
      <dialog ref={ref} className="modal" aria-labelledby="reo-title" style={{ width: "min(480px, calc(100vw - 32px))" }}>
        <div className="modal-head">
          <h2 id="reo-title" className="section-title">Reabrir {expName}?</h2>
          <button type="button" className="btn ghost sm" onClick={() => ref.current?.close()}>Fechar</button>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <div className="notice" role="status">
            O valor apurado na conclusão será descartado e o ganho volta a aparecer como “a liberar” para o parceiro. Se o
            crédito desta expedição já foi lançado no HubSpot, ajuste o lançamento lá.
          </div>
          {state?.error ? <div className="error" role="alert">{state.error}</div> : null}
          <div className="row">
            <button type="button" className="btn primary" disabled={pending} onClick={run}>
              {pending ? "Reabrindo…" : "Reabrir expedição"}
            </button>
            <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>Cancelar</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
