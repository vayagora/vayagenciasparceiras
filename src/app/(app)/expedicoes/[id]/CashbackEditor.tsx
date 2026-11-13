"use client";

// Vay: editar o cashback final de um negócio (ex.: pagamento misto) e ver o histórico de alterações.
import { useRef, useState, useTransition } from "react";
import type { CashbackChange } from "@/lib/types";
import { setCashback } from "../../actions";

const brl = (v: number | null) =>
  v === null ? "calculado" : "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CashbackEditor({
  dealId,
  dealNo,
  current,
  calculated,
  override,
  history,
}: {
  dealId: string;
  dealNo: string;
  current: number;
  calculated: number;
  override: number | null;
  history: CashbackChange[];
}) {
  const edit = useRef<HTMLDialogElement>(null);
  const hist = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(override === null ? "" : String(override).replace(".", ","));
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const save = (v: string | null) =>
    start(async () => {
      const r = (await setCashback(dealId, v, note)) ?? {};
      setMsg(r);
      if (r.ok) {
        setNote("");
        edit.current?.close();
      }
    });
  return (
    <>
      <button type="button" className="btn outline sm" onClick={() => edit.current?.showModal()}>Editar cashback</button>
      {history.length ? (
        <button type="button" className="btn ghost sm" onClick={() => hist.current?.showModal()}>
          Histórico ({history.length})
        </button>
      ) : null}
      {msg.ok ? <span className="small muted" role="status">{msg.ok}</span> : null}

      <dialog ref={edit} className="modal" aria-labelledby={`cb-${dealId}`} style={{ width: "min(460px, calc(100vw - 32px))" }}>
        <div className="modal-head">
          <h2 id={`cb-${dealId}`} className="section-title">Cashback do negócio {dealNo}</h2>
          <button type="button" className="btn ghost sm" onClick={() => edit.current?.close()}>Fechar</button>
        </div>
        <div className="stack">
          <p className="small muted">
            Hoje: <strong>{brl(current)}</strong> · pelas regras: {brl(calculated)}
            {override !== null ? " · editado pela Vay" : ""}
          </p>
          <div className="field">
            <label htmlFor={`cbv-${dealId}`}>Cashback final (R$)</label>
            <input id={`cbv-${dealId}`} className="input" inputMode="decimal" placeholder="Ex.: 120,50" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`cbn-${dealId}`}>Motivo</label>
            <input id={`cbn-${dealId}`} className="input" placeholder="Ex.: R$ 2.000 pagos com crédito, R$ 4.000 no Pix" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {msg.error ? <div className="error" role="alert">{msg.error}</div> : null}
          <div className="row">
            <button type="button" className="btn primary" disabled={pending || value.trim() === ""} onClick={() => save(value)}>Salvar</button>
            {override !== null ? (
              <button type="button" className="btn ghost" disabled={pending} onClick={() => save(null)}>Voltar ao calculado</button>
            ) : null}
          </div>
        </div>
      </dialog>

      <dialog ref={hist} className="modal" aria-labelledby={`cbh-${dealId}`} style={{ width: "min(560px, calc(100vw - 32px))" }}>
        <div className="modal-head">
          <h2 id={`cbh-${dealId}`} className="section-title">Histórico do cashback · {dealNo}</h2>
          <button type="button" className="btn ghost sm" onClick={() => hist.current?.close()}>Fechar</button>
        </div>
        <ol className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {history.map((h) => (
            <li key={h.id} className="note">
              <span><strong>{brl(h.old_value)}</strong> → <strong>{brl(h.new_value)}</strong> <span className="muted">(pelas regras: {brl(h.calculated)})</span></span>
              {h.note ? <span>{h.note}</span> : null}
              <span className="small muted">
                {h.changed_by_name || "Vay Agora"} · {new Date(h.changed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
              </span>
            </li>
          ))}
        </ol>
      </dialog>
    </>
  );
}
