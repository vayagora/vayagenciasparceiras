"use client";

// Negócio do HubSpot em uma linha compacta; os detalhes e as ações abrem num modal.
import { useRef, useState, useTransition } from "react";
import type { Tone } from "@/lib/commission";
import type { CashbackChange } from "@/lib/types";
import { assignDeal, setReviewed } from "../../actions";
import { CashbackEditor } from "./CashbackEditor";

export type DealView = {
  id: string;
  no: string;
  name: string;
  hubspotUrl: string | null;
  // avisos: os que pedem conferência e os informativos
  flags: { key: string; label: string; tone: Tone; pending: boolean }[];
  flagKeys: string[]; // chaves que a conferência cobre
  needsReview: boolean;
  reviewed: { by: string; at: string | null } | null; // conferência vigente
  reviewStale: boolean; // conferido antes, mas surgiu aviso novo
  manual: boolean;
  passengers: { id: string; name: string; note: string; strong: boolean }[];
  routeShort: string;
  route: string;
  closedOn: string;
  products: string;
  payment: string;
  reason: string;
  com: number;
  comLabel: string;
  // ações (negócios sinalizados)
  assign?: { value: string; options: { value: string; label: string }[]; canLinkHere: boolean; hereExpId: string };
  cashback?: { current: number; calculated: number; override: number | null; history: CashbackChange[] };
  // não sinalizados
  fixes?: string[];
  evidence?: { label: string; tone: Tone };
};

const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "";

export function DealRow({ v }: { v: DealView }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setErr("");
      try {
        await fn();
      } catch {
        setErr("Não foi possível salvar.");
      }
    });
  const pendingFlags = v.flags.filter((f) => f.pending);
  const titular = v.passengers[0];
  const reviewedTxt = v.reviewed ? `Conferido${v.reviewed.by ? ` por ${v.reviewed.by}` : ""}${v.reviewed.at ? ` em ${day(v.reviewed.at)}` : ""}` : "";

  return (
    <div className={`dealrow${v.needsReview ? " review" : ""}`} style={{ opacity: pending ? 0.6 : 1 }}>
      <button type="button" className="dealrow-main" onClick={() => ref.current?.showModal()} aria-haspopup="dialog" aria-label={`Detalhes do negócio ${v.no}`}>
        <span className="strong nowrap">{v.no}</span>
        <span className="dealrow-badges">
          {v.needsReview ? (
            <>
              <span className={`badge ${pendingFlags[0]?.tone ?? "yellow"}`}>{pendingFlags[0]?.label ?? "Para conferir"}</span>
              {pendingFlags.length > 1 ? <span className="badge neutral">+{pendingFlags.length - 1}</span> : null}
            </>
          ) : v.reviewed ? (
            <span className="badge success">{reviewedTxt}</span>
          ) : (
            <span className="badge success">Sem pendência</span>
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
            {v.flags.map((f) => (
              <span key={f.key} className={`badge ${f.pending && v.needsReview ? f.tone : "neutral"}`}>{f.label}</span>
            ))}
            {v.manual ? <span className="badge purple">Ajuste manual</span> : null}
            {v.evidence ? <span className={`badge ${v.evidence.tone}`}>{v.evidence.label}</span> : null}
            {!v.flags.length && !v.manual && !v.evidence ? <span className="badge success">Vínculo exato</span> : null}
          </div>
          {v.reviewed ? <p className="small" style={{ color: "#17694A" }}>{reviewedTxt}.</p> : null}
          {v.reviewStale ? <p className="small" style={{ color: "var(--yellow-900)" }}>Já foi conferido antes, mas apareceu um aviso novo.</p> : null}

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
            <dd>{v.closedOn}</dd>
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
            <a href={v.hubspotUrl} target="_blank" rel="noreferrer" className="small">Abrir no HubSpot</a>
          ) : null}

          {v.assign ? (
            <div className="field">
              <label htmlFor={`as-${v.id}`}>Expedição do negócio</label>
              <select
                id={`as-${v.id}`}
                className="select"
                value={v.assign.value}
                disabled={pending}
                onChange={(e) => run(() => assignDeal(v.id, e.target.value))}
              >
                {v.assign.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ) : null}
          {err ? <div className="error" role="alert">{err}</div> : null}

          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="row" style={{ gap: 6 }}>
              {v.assign?.canLinkHere ? (
                <button type="button" className="btn secondary sm" disabled={pending} onClick={() => run(() => assignDeal(v.id, v.assign!.hereExpId))}>
                  Vincular a esta expedição
                </button>
              ) : null}
              {v.cashback ? (
                <CashbackEditor
                  dealId={v.id}
                  dealNo={v.no}
                  current={v.cashback.current}
                  calculated={v.cashback.calculated}
                  override={v.cashback.override}
                  history={v.cashback.history}
                />
              ) : null}
            </div>
            <div className="row" style={{ gap: 6 }}>
              {v.needsReview ? (
                <button type="button" className="btn primary sm" disabled={pending} onClick={() => run(() => setReviewed(v.id, true, v.flagKeys))}>
                  Marcar como conferido
                </button>
              ) : null}
              {v.reviewed ? (
                <button type="button" className="btn ghost sm" disabled={pending} onClick={() => run(() => setReviewed(v.id, false))}>
                  Desfazer conferência
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
