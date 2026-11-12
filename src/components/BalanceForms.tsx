"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addBalanceEntry, deleteBalanceEntry } from "@/app/(app)/actions";
import { brl } from "@/lib/format";

const parse = (v: string) => {
  const s = v.replace(/[R$\s]/g, "");
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s) || 0;
};

// Vay: lançar entrada (ex.: bonificação) ou saída (uso dos créditos) no extrato do parceiro.
export function AddEntryButton({ partnerId, partnerName, balance }: { partnerId: string; partnerName: string; balance: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(addBalanceEntry.bind(null, partnerId), undefined);
  const [kind, setKind] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setAmount("");
      ref.current?.close();
    }
  }, [state]);
  const v = parse(amount);
  const preview = balance + (kind === "in" ? v : -v);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return (
    <>
      <button type="button" className="btn primary" onClick={() => ref.current?.showModal()}>Adicionar lançamento</button>
      {state?.ok ? <div className="notice" role="status">{state.ok}</div> : null}
      <dialog ref={ref} className="modal" aria-labelledby="add-entry-title">
        <div className="modal-head">
          <div className="stack" style={{ gap: 2 }}>
            <h2 id="add-entry-title" className="section-title">Adicionar lançamento</h2>
            <span className="small muted">Para {partnerName} · saldo atual {brl(balance)}</span>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => ref.current?.close()}>Fechar</button>
        </div>
        <form ref={formRef} action={action} className="form">
          <fieldset className="row" style={{ border: 0, padding: 0, margin: 0, gap: 16 }}>
            <legend className="small muted" style={{ marginBottom: 6 }}>Tipo</legend>
            <label className="row" style={{ gap: 6 }}>
              <input type="radio" name="kind" value="in" checked={kind === "in"} onChange={() => setKind("in")} /> Entrada (ex.: bonificação)
            </label>
            <label className="row" style={{ gap: 6 }}>
              <input type="radio" name="kind" value="out" checked={kind === "out"} onChange={() => setKind("out")} /> Saída (uso dos créditos)
            </label>
          </fieldset>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="be-amount">Valor (R$)</label>
              <input id="be-amount" name="amount" inputMode="decimal" className="input" placeholder="Ex.: 150,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="be-date">Data</label>
              <input id="be-date" name="entry_date" type="date" className="input" defaultValue={today} required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="be-title">Motivo</label>
            <input id="be-title" name="title" className="input" placeholder={kind === "in" ? "Ex.: Bonificação por meta do trimestre" : "Ex.: Passagem GRU → LIS para a guia"} required />
          </div>
          <div className="field">
            <label htmlFor="be-note">Observação (opcional · aparece no extrato do parceiro)</label>
            <input id="be-note" name="note" className="input" />
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="small">Novo saldo: <strong>{brl(preview)}</strong></span>
          </div>
          {state?.error ? <div className="error" role="alert">{state.error}</div> : null}
          <div className="row">
            <button type="submit" className="btn primary" disabled={pending || v <= 0}>{kind === "in" ? "Lançar entrada" : "Lançar saída"}</button>
            <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>Cancelar</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function DeleteEntryButton({ entryId }: { entryId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn ghost sm"
      disabled={pending}
      onClick={() => {
        if (window.confirm("Apagar este lançamento do extrato?")) start(() => deleteBalanceEntry(entryId));
      }}
    >
      Apagar
    </button>
  );
}
