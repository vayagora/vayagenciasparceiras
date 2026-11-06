"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CITIES } from "@/lib/cities";
import { STAGES } from "@/lib/commission";
import { parseRows } from "@/lib/csv";
import type { StageId } from "@/lib/types";
import { Tip } from "@/components/ui";
import { addClient, assignDeal, createDeal, importClients, saveFollowUp, setReviewed, type FormState } from "../../actions";

function Feedback({ state }: { state: FormState }) {
  if (state?.error) return <div className="error" role="alert">{state.error}</div>;
  if (state?.ok) return <div className="notice" role="status">{state.ok}</div>;
  return null;
}

// ---------- Parceiro: cadastrar e importar clientes ----------

export function ClientTools({ expId, startOpen }: { expId: string; startOpen: boolean }) {
  const [open, setOpen] = useState<"add" | "import" | null>(startOpen ? "add" : null);
  return (
    <div className="stack">
      <div className="row">
        <button type="button" className={`btn ${open === "add" ? "secondary" : "outline"}`} aria-expanded={open === "add"} onClick={() => setOpen(open === "add" ? null : "add")}>
          Cadastrar cliente
        </button>
        <button type="button" className={`btn ${open === "import" ? "secondary" : "outline"}`} aria-expanded={open === "import"} onClick={() => setOpen(open === "import" ? null : "import")}>
          Importar planilha
        </button>
      </div>
      {open === "add" ? <AddClientForm expId={expId} onClose={() => setOpen(null)} /> : null}
      {open === "import" ? <ImportForm expId={expId} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function AddClientForm({ expId, onClose }: { expId: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(addClient.bind(null, expId), undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <section className="panel stack">
      <div className="ttl">
        <h2 className="section-title">Cadastrar cliente</h2>
        <Tip>O e-mail é usado para encontrar o cliente na base da Vay Agora.</Tip>
      </div>
      <form ref={ref} action={action} className="form">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="nc-name">Nome</label>
            <input id="nc-name" name="name" className="input" required />
          </div>
          <div className="field">
            <label htmlFor="nc-email">E-mail</label>
            <input id="nc-email" name="email" type="email" className="input" required />
          </div>
          <div className="field">
            <label htmlFor="nc-phone">Telefone</label>
            <input id="nc-phone" name="phone" type="tel" className="input" placeholder="(11) 99999-9999" />
          </div>
        </div>
        <Feedback state={state} />
        <div className="row">
          <button type="submit" className="btn primary" disabled={pending}>Adicionar cliente</button>
          <button type="button" className="btn ghost" onClick={onClose}>Fechar</button>
        </div>
      </form>
    </section>
  );
}

function ImportForm({ expId, onClose }: { expId: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(importClients.bind(null, expId), undefined);
  const [text, setText] = useState("");
  const [fileNote, setFileNote] = useState("Nenhum arquivo selecionado");
  const preview = parseRows(text);
  useEffect(() => {
    if (state?.ok) {
      setText("");
      setFileNote("Nenhum arquivo selecionado");
    }
  }, [state]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) {
      setFileNote("Arquivos .xlsx: salve como CSV ou cole as linhas abaixo.");
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      setText(String(r.result ?? ""));
      setFileNote(f.name);
    };
    r.readAsText(f, "utf-8");
  }

  return (
    <section className="panel stack">
      <div className="ttl">
        <h2 className="section-title">Importar clientes por planilha</h2>
        <Tip>Envie um arquivo CSV ou cole as linhas copiadas do Excel ou Google Planilhas. Colunas: nome, e-mail, telefone.</Tip>
      </div>
      <form action={action} className="form">
        <div className="row">
          <label className="filebtn">
            Escolher arquivo CSV
            <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" className="sr-only" onChange={onFile} />
          </label>
          <span className="small muted">{fileNote}</span>
        </div>
        <div className="field">
          <label htmlFor="imp-text">Ou cole aqui</label>
          <textarea id="imp-text" name="rows" className="textarea mono" value={text} onChange={(e) => setText(e.target.value)} placeholder={"nome;e-mail;telefone\nAna Ribeiro;ana@email.com;(11) 98123-4410"} />
        </div>
        {preview.length ? (
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="card-head small muted" style={{ padding: "12px 16px" }}>
              {preview.length} {preview.length === 1 ? "cliente encontrado" : "clientes encontrados"}
              {preview.length > 5 ? " · mostrando os 5 primeiros" : ""}
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <tbody>
                  {preview.slice(0, 5).map((p, i) => (
                    <tr key={i}><td className="strong">{p.name}</td><td>{p.email}</td><td>{p.phone}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        <Feedback state={state} />
        <div className="row">
          <button type="submit" className="btn primary" disabled={pending || preview.length === 0}>
            {preview.length ? `Adicionar ${preview.length} ${preview.length === 1 ? "cliente" : "clientes"}` : "Adicionar clientes"}
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>Fechar</button>
        </div>
      </form>
    </section>
  );
}

// ---------- Vay: follow-up ----------

export function FollowUpForm({ expId, client }: { expId: string; client: { id: string; name: string; contact: string; stage: StageId; note: string } }) {
  const [state, action, pending] = useActionState(saveFollowUp.bind(null, client.id), undefined);
  return (
    <section className="panel stack" id="follow-up">
      <div className="stack" style={{ gap: 2 }}>
        <div className="eyebrow">Follow-up</div>
        <div className="ttl">
          <h2 className="section-title">{client.name}</h2>
          <Tip>Compras e valores vêm dos negócios fechados no HubSpot com o afiliado deste parceiro e não são editados aqui.</Tip>
        </div>
        <span className="small muted">{client.contact}</span>
      </div>
      <form action={action} className="form">
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="fu-stage">Etapa</label>
          <select id="fu-stage" name="stage" className="select" defaultValue={client.stage}>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="fu-note">Nota do follow-up</label>
          <textarea id="fu-note" name="note" className="textarea" defaultValue={client.note} />
        </div>
        <Feedback state={state} />
        <div className="row">
          <button type="submit" className="btn primary" disabled={pending}>Salvar follow-up</button>
          <Link href={`/expedicoes/${expId}`} className="btn ghost">Fechar</Link>
        </div>
      </form>
    </section>
  );
}

// ---------- Vay: conciliação de negócios ----------

export function DealActions({
  dealId,
  hereExpId,
  value,
  options,
  canLinkHere,
  canReview,
  reviewed,
}: {
  dealId: string;
  hereExpId: string;
  value: string;
  options: { value: string; label: string }[];
  canLinkHere: boolean;
  canReview: boolean;
  reviewed: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="row" style={{ opacity: pending ? 0.6 : 1 }}>
      <label className="sr-only" htmlFor={`as-${dealId}`}>Expedição do negócio</label>
      <select
        id={`as-${dealId}`}
        className="select"
        style={{ width: "auto", maxWidth: "100%" }}
        value={value}
        disabled={pending}
        onChange={(e) => start(() => assignDeal(dealId, e.target.value))}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {canLinkHere ? (
        <button type="button" className="btn secondary sm" disabled={pending} onClick={() => start(() => assignDeal(dealId, hereExpId))}>
          Vincular a esta expedição
        </button>
      ) : null}
      {canReview ? (
        <button type="button" className="btn outline sm" disabled={pending} onClick={() => start(() => setReviewed(dealId, true))}>
          Marcar como conferido
        </button>
      ) : null}
      {reviewed ? (
        <button type="button" className="btn ghost sm" disabled={pending} onClick={() => start(() => setReviewed(dealId, false))}>
          Desfazer conferência
        </button>
      ) : null}
    </div>
  );
}

export function NewDealForm({ afiliado, defaultCity, defaultDate }: { afiliado: string; defaultCity: string; defaultDate: string }) {
  const [state, action, pending] = useActionState(createDeal.bind(null, afiliado), undefined);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  if (!open)
    return (
      <button type="button" className="btn outline sm" onClick={() => setOpen(true)}>
        Registrar negócio manualmente
      </button>
    );
  const cityOptions = CITIES.map((c) => <option key={c.name} value={c.name}>{c.label}</option>);
  return (
    <form ref={ref} action={action} className="panel form">
      <div className="ttl">
        <h3 className="section-title">Registrar negócio fechado</h3>
        <Tip>Use enquanto a sincronização com o HubSpot não estiver ativa. O negócio é vinculado pelas mesmas regras de afiliado, data e destino.</Tip>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="nd-name">Cliente</label><input id="nd-name" name="contact_name" className="input" required /></div>
        <div className="field"><label htmlFor="nd-email">E-mail do cliente</label><input id="nd-email" name="email" type="email" className="input" /></div>
        <div className="field"><label htmlFor="nd-closed">Fechado em</label><input id="nd-closed" name="closed_on" type="date" className="input" required /></div>
      </div>
      <div className="form-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="stack" style={{ gap: 8 }}>
            <div className="field">
              <label htmlFor={`nd-c${i}`}>Trecho {i + 1}{i ? " (opcional)" : ""}</label>
              <select id={`nd-c${i}`} name={`leg_city_${i}`} className="select" defaultValue={i === 0 ? defaultCity : ""} required={i === 0}>
                <option value="">—</option>
                {cityOptions}
              </select>
            </div>
            <input aria-label={`Data do trecho ${i + 1}`} name={`leg_date_${i}`} type="date" className="input" defaultValue={i === 0 ? defaultDate : ""} required={i === 0} />
          </div>
        ))}
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor="nd-end">Volta em</label><input id="nd-end" name="end_date" type="date" className="input" required /></div>
        <div className="field"><label htmlFor="nd-voo">Voo (R$)</label><input id="nd-voo" name="voo" inputMode="decimal" className="input" placeholder="0,00" /></div>
        <div className="field"><label htmlFor="nd-hotel">Hospedagem (R$)</label><input id="nd-hotel" name="hotel" inputMode="decimal" className="input" placeholder="0,00" /></div>
        <div className="field"><label htmlFor="nd-seg">Seguro (R$)</label><input id="nd-seg" name="seguro" inputMode="decimal" className="input" placeholder="0,00" /></div>
      </div>
      <Feedback state={state} />
      <div className="row">
        <button type="submit" className="btn primary" disabled={pending}>Registrar negócio</button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Fechar</button>
      </div>
    </form>
  );
}
