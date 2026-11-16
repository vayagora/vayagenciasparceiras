"use client";

// Célula Voo / Hospedagem / Seguro: com compra, o selo abre um modal com os dados do produto no HubSpot.
// Só leitura (SPEC 2.0): todo lançamento é feito no HubSpot.
import { useRef } from "react";
import type { DealDetails } from "@/lib/types";

type Product = "voo" | "hotel" | "seguro";
export type ProductDeal = { id: string; no: string; value: number | null; details: DealDetails };

const TITLE: Record<Product, string> = { voo: "Voo", hotel: "Hospedagem", seguro: "Seguro viagem" };

const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");

export function ProductCell({
  product,
  primary,
  included,
}: {
  product: Product;
  primary: ProductDeal[]; // negócios ganhos em que esta é a linha principal (com valor)
  included: ProductDeal[]; // negócios ganhos de outro passageiro em que esta pessoa está incluída
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const all = [...primary, ...included];
  if (!all.length)
    return (
      <td>
        <span className="muted">—</span>
      </td>
    );
  const total = primary.reduce((a, x) => a + (x.value ?? 0), 0);
  return (
    <td>
      <button type="button" className="badge success badge-btn" onClick={() => ref.current?.showModal()} aria-haspopup="dialog">
        {primary.length ? "Comprado" : `Incluído no ${included.map((x) => x.no).join(", ")}`}
        <span aria-hidden="true">↗</span>
      </button>
      <div className="sub">{primary.length ? brl(total) : "—"}</div>
      <dialog ref={ref} className="modal" aria-labelledby={`m-${product}-${all[0].id}`}>
        <div className="modal-head">
          <h2 id={`m-${product}-${all[0].id}`} className="section-title">{TITLE[product]}</h2>
          <button type="button" className="btn ghost sm" onClick={() => ref.current?.close()} aria-label="Fechar">Fechar</button>
        </div>
        <div className="stack">
          {all.map((x) => (
            <section key={x.id} className="stack modal-block">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="strong">Negócio {x.no}</span>
                {x.value ? <span className="small muted">{brl(x.value)}</span> : null}
              </div>
              <Details product={product} details={x.details} />
            </section>
          ))}
        </div>
      </dialog>
    </td>
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
