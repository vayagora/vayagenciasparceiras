"use client";

// Negócio do HubSpot em uma linha compacta; os detalhes abrem num modal. Só leitura (SPEC 2.0):
// qualquer correção é feita no HubSpot e aparece aqui na próxima sincronização.
import { useRef } from "react";
import type { Tone } from "@/lib/commission";

export type DealView = {
  id: string;
  no: string;
  name: string;
  hubspotUrl: string | null;
  stage: { label: string; tone: Tone };
  // pending = pede correção no HubSpot; os demais só informam
  flags: { key: string; label: string; tone: Tone; pending: boolean }[];
  needsReview: boolean;
  passengers: { id: string; name: string; note: string; strong: boolean }[];
  routeShort: string;
  route: string;
  closedOn: string;
  products: string;
  payment: string;
  reason: string;
  com: number;
  comLabel: string;
  fixes?: string[];
};

const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DealRow({ v }: { v: DealView }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pendingFlags = v.flags.filter((f) => f.pending);
  const titular = v.passengers[0];

  return (
    <div className={`dealrow${v.needsReview ? " review" : ""}`}>
      <button type="button" className="dealrow-main" onClick={() => ref.current?.showModal()} aria-haspopup="dialog" aria-label={`Detalhes do negócio ${v.no}`}>
        <span className="strong nowrap">{v.no}</span>
        <span className="dealrow-badges">
          {v.needsReview ? (
            <>
              <span className={`badge ${pendingFlags[0]?.tone ?? "yellow"}`}>{pendingFlags[0]?.label ?? "Corrigir no HubSpot"}</span>
              {pendingFlags.length > 1 ? <span className="badge neutral">+{pendingFlags.length - 1}</span> : null}
            </>
          ) : (
            <span className={`badge ${v.stage.tone} dot`}>{v.stage.label}</span>
          )}
        </span>
        <span className="dealrow-txt">
          {titular ? titular.name : "Sem contatos"}
          {v.passengers.length > 1 ? <span className="muted"> +{v.passengers.length - 1}</span> : null}
        </span>
        <span className="dealrow-txt muted">{v.routeShort}</span>
        <span className="dealrow-com">
          <strong>{brl(v.com)}</strong>
          <span className="small muted">{v.comLabel}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)", flex: "none" }}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      <dialog ref={ref} className="modal" aria-labelledby={`dl-${v.id}`} style={{ width: "min(640px, calc(100vw - 32px))" }}>
        <div className="modal-head">
          <div className="stack" style={{ gap: 2 }}>
            <h2 id={`dl-${v.id}`} className="section-title">Negócio {v.no}</h2>
            {v.name ? <span className="small muted">{v.name}</span> : null}
          </div>
          <button type="button" className="btn ghost sm" onClick={() => ref.current?.close()}>Fechar</button>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className={`badge ${v.stage.tone} dot`}>{v.stage.label}</span>
            {v.flags.map((f) => (
              <span key={f.key} className={`badge ${f.pending ? f.tone : "neutral"}`}>{f.label}</span>
            ))}
          </div>

          <dl className="facts">
            <dt>Passageiros</dt>
            <dd>
              {v.passengers.length
                ? v.passengers.map((p, i) => (
                    <span key={p.id}>
                      {i ? " · " : ""}
                      <span className={p.strong ? "strong" : undefined}>{p.name}</span>
                      {p.note ? <span className="muted"> ({p.note})</span> : null}
                    </span>
                  ))
                : "Sem contatos associados"}
            </dd>
            <dt>Roteiro</dt>
            <dd>{v.route}</dd>
            <dt>Fechado em</dt>
            <dd>{v.closedOn || "—"}</dd>
            <dt>Produtos</dt>
            <dd>{v.products}</dd>
            <dt>Pagamento</dt>
            <dd>{v.payment}</dd>
            <dt>{v.comLabel}</dt>
            <dd className="strong">{brl(v.com)}</dd>
          </dl>
          {v.reason ? <p className="small muted">{v.reason}</p> : null}
          {v.fixes?.length ? (
            <p className="small"><strong>Para corrigir no HubSpot:</strong> {v.fixes.join("; ")}.</p>
          ) : null}
          {v.hubspotUrl ? (
            <a href={v.hubspotUrl} target="_blank" rel="noreferrer" className="btn secondary sm" style={{ alignSelf: "flex-start" }}>
              Abrir no HubSpot
            </a>
          ) : null}
        </div>
      </dialog>
    </div>
  );
}
