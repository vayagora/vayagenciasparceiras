"use client";

// Célula Voo / Hospedagem / Seguro: com compra, o selo abre um modal com os dados do HubSpot,
// os comentários e os arquivos. A Vay adiciona e apaga; o parceiro vê.
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DealDetails, DealNote } from "@/lib/types";
import { addDealNote, attachmentUrl, deleteDealNote } from "../../actions";

type Product = "voo" | "hotel" | "seguro";
export type ProductDeal = { id: string; no: string; value: number | null; details: DealDetails; notes: DealNote[] };

const TITLE: Record<Product, string> = { voo: "Voo", hotel: "Hospedagem", seguro: "Seguro viagem" };

const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");

export function ProductCell({
  product,
  primary,
  included,
  hasDeal,
  canEdit,
}: {
  product: Product;
  primary: ProductDeal[]; // negócios em que esta é a linha principal (com valor)
  included: ProductDeal[]; // negócios de outro passageiro em que esta pessoa está incluída
  hasDeal: boolean;
  canEdit: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const all = [...primary, ...included];
  if (!all.length)
    return (
      <td>
        <span className="badge neutral">{hasDeal ? "Não comprou" : "Sem compra"}</span>
        <div className="sub">—</div>
      </td>
    );
  const total = primary.reduce((a, x) => a + (x.value ?? 0), 0);
  const count = all.reduce((a, x) => a + x.notes.filter((n) => n.product === product).length, 0);
  return (
    <td>
      <button type="button" className="badge success badge-btn" onClick={() => ref.current?.showModal()} aria-haspopup="dialog">
        {primary.length ? "Comprado" : `Incluído no ${included.map((x) => x.no).join(", ")}`}
        <span aria-hidden="true">↗</span>
      </button>
      <div className="sub">
        {primary.length ? brl(total) : "—"}
        {count ? ` · ${count} ${count === 1 ? "anexo" : "anexos"}` : ""}
      </div>
      <dialog ref={ref} className="modal" aria-labelledby={`m-${product}-${all[0].id}`}>
        <div className="modal-head">
          <h2 id={`m-${product}-${all[0].id}`} className="section-title">{TITLE[product]}</h2>
          <button type="button" className="btn ghost sm" onClick={() => ref.current?.close()} aria-label="Fechar">Fechar</button>
        </div>
        <div className="stack">
          {all.map((x) => (
            <DealBlock key={x.id} product={product} deal={x} canEdit={canEdit} />
          ))}
        </div>
      </dialog>
    </td>
  );
}

function DealBlock({ product, deal, canEdit }: { product: Product; deal: ProductDeal; canEdit: boolean }) {
  const notes = deal.notes.filter((n) => n.product === product);
  return (
    <section className="stack modal-block">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="strong">Negócio {deal.no}</span>
        {deal.value ? <span className="small muted">{brl(deal.value)}</span> : null}
      </div>
      <Details product={product} details={deal.details} />
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Comentários e arquivos</span>
        {notes.length ? notes.map((n) => <NoteItem key={n.id} note={n} canEdit={canEdit} />) : <p className="small muted">Nada adicionado ainda.</p>}
      </div>
      {canEdit ? <AddNote dealId={deal.id} product={product} /> : null}
    </section>
  );
}

function Details({ product, details }: { product: Product; details: DealDetails }) {
  if (product === "voo") {
    const segs = details.voo?.segments ?? [];
    if (!segs.length) return <p className="small muted">Sem detalhes dos trechos no HubSpot.</p>;
    return (
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Data</th><th>Trecho</th><th>Saída</th><th>Chegada</th><th>Companhia</th></tr>
          </thead>
          <tbody>
            {segs.map((s, i) => (
              <tr key={i}>
                <td>{d(s.date)}</td>
                <td>{s.from ? `${s.from} → ` : ""}{s.to}</td>
                <td>{s.dep || "—"}</td>
                <td>{s.arr || "—"}</td>
                <td>{s.airline || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (product === "hotel") {
    const h = details.hotel;
    if (!h) return <p className="small muted">Sem detalhes da hospedagem no HubSpot.</p>;
    return (
      <dl className="facts">
        <dt>Hotel</dt><dd>{h.name || "—"}</dd>
        <dt>Cidade</dt><dd>{h.city || "—"}</dd>
        <dt>Check-in</dt><dd>{d(h.checkin)}{h.checkinTime ? ` · ${h.checkinTime}` : ""}</dd>
        <dt>Check-out</dt><dd>{d(h.checkout)}{h.checkoutTime ? ` · ${h.checkoutTime}` : ""}</dd>
        <dt>Quartos</dt><dd>{h.room || "—"}</dd>
        <dt>Alimentação</dt><dd>{h.board || "—"}</dd>
      </dl>
    );
  }
  const g = details.seguro;
  if (!g) return <p className="small muted">Sem detalhes do seguro no HubSpot.</p>;
  return (
    <dl className="facts">
      <dt>Plano</dt><dd>{g.plan || "—"}</dd>
      <dt>Tipo</dt><dd>{g.type || "—"}</dd>
      <dt>Destino</dt><dd>{g.destination || "—"}</dd>
      <dt>Vigência</dt><dd>{d(g.start)} a {d(g.end)}</dd>
      <dt>Cobertura</dt><dd>{g.coverage || "—"}</dd>
    </dl>
  );
}

function NoteItem({ note, canEdit }: { note: DealNote; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const open = () =>
    start(async () => {
      setErr("");
      const url = note.file_path ? await attachmentUrl(note.file_path) : null;
      if (url) window.open(url, "_blank", "noopener");
      else setErr("Não foi possível abrir o arquivo.");
    });
  return (
    <div className="note" style={{ opacity: pending ? 0.6 : 1 }}>
      {note.body ? <p style={{ whiteSpace: "pre-wrap" }}>{note.body}</p> : null}
      {note.file_path ? (
        <button type="button" className="btn outline sm" onClick={open} disabled={pending}>
          Abrir arquivo · {note.file_name || "anexo"}
        </button>
      ) : null}
      <div className="row small muted" style={{ justifyContent: "space-between" }}>
        <span>{note.created_by_name || "Vay Agora"} · {new Date(note.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
        {canEdit ? (
          <button type="button" className="btn ghost sm" disabled={pending} onClick={() => start(() => deleteDealNote(note.id))}>
            Apagar
          </button>
        ) : null}
      </div>
      {err ? <div className="error" role="alert">{err}</div> : null}
    </div>
  );
}

function AddNote({ dealId, product }: { dealId: string; product: Product }) {
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = () =>
    start(async () => {
      setMsg({});
      let uploaded: { path: string; name: string } | undefined;
      if (file) {
        if (file.size > 20 * 1024 * 1024) return setMsg({ error: "Arquivo maior que 20 MB." });
        const safe = file.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
        const path = `${dealId}/${product}/${crypto.randomUUID()}-${safe}`;
        const { error } = await createClient().storage.from("anexos").upload(path, file, { contentType: file.type || undefined });
        if (error) return setMsg({ error: "Não foi possível enviar o arquivo." });
        uploaded = { path, name: file.name };
      }
      const r = await addDealNote(dealId, product, body, uploaded);
      setMsg(r ?? {});
      if (r?.ok) {
        setBody("");
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="sr-only" htmlFor={`nb-${dealId}-${product}`}>Comentário</label>
      <textarea id={`nb-${dealId}-${product}`} className="textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Comentário (o parceiro vê)" />
      <div className="row">
        <label className="filebtn">
          {file ? file.name : "Anexar arquivo"}
          <input ref={fileRef} type="file" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button type="button" className="btn primary sm" onClick={submit} disabled={pending || (!body.trim() && !file)}>
          {pending ? "Salvando…" : "Adicionar"}
        </button>
      </div>
      {msg.error ? <div className="error" role="alert">{msg.error}</div> : null}
      {msg.ok ? <div className="notice" role="status">{msg.ok}</div> : null}
    </div>
  );
}
