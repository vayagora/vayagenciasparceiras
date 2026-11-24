"use client";

// Conferência da expedição (só Vay, SPEC 2.4).
// "A conferir": passageiros com pendência (negócio conjunto da agência ainda não marcado, composição que mudou,
// negócio não sinalizado, ou outro negócio pendente de alguém do mesmo grupo). Negócio conjunto: "Marcar como
// passageiros" (o negócio inteiro). Não sinalizado: corrigir no HubSpot ou "Marcar como conferido".
// "Conferidos": passageiros de negócios não sinalizados que a Vay conferiu (não são da expedição); dá para desfazer.
import { useState, useTransition } from "react";
import type { Tone } from "@/lib/commission";
import { approveJointDeal, setPersonReviewed } from "../../actions";

export type ReviewRow = {
  key: string;
  name: string;
  email: string;
  reasons: { label: string; tone: Tone }[];
  deals: { id: string; no: string; url: string | null; stage: string; route: string; fix: string; canApprove: boolean }[];
  canConfer: boolean; // tem negócio não sinalizado: pode marcar como conferido
  reviewed: string | null; // "Conferido por X em dd/mm/aaaa"
  group: string;
  sub: boolean; // mesmo negócio da linha acima
  matesTxt: string;
};

export function ReviewTable({ expId, rows, done, emptyText }: { expId: string; rows: ReviewRow[]; done: boolean; emptyText: string }) {
  return (
    <div className="table-wrap">
      <table className="tbl clients" style={{ minWidth: 900 }}>
        <thead>
          <tr>
            <th>Passageiro</th>
            <th>Motivo</th>
            <th>Negócio no HubSpot</th>
            <th>O que fazer</th>
            <th><span className="sr-only">Ação</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <Row key={r.key} expId={expId} r={r} done={done} />)}
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="empty">{emptyText}</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function Row({ expId, r, done }: { expId: string; r: ReviewRow; done: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const run = (fn: () => Promise<{ error?: string } | undefined>) =>
    start(async () => {
      const res = await fn();
      setErr(res?.error ?? "");
    });
  return (
    <tr className={r.sub ? "subrow" : undefined} style={{ opacity: pending ? 0.6 : 1 }}>
      <td style={r.sub ? { paddingLeft: 28 } : undefined}>
        {r.sub ? <span className="muted" aria-hidden="true">↳ </span> : null}
        <span className="strong">{r.name}</span>
        {r.email ? <div className="sub">{r.email}</div> : null}
        {r.reviewed ? <div className="sub">{r.reviewed}</div> : null}
        {r.matesTxt ? <div className="sub">{r.matesTxt}</div> : null}
      </td>
      <td>
        <div className="stack" style={{ gap: 4, alignItems: "flex-start" }}>
          {r.reasons.map((x) => <span key={x.label} className={`badge ${x.tone}`}>{x.label}</span>)}
        </div>
      </td>
      <td>
        {r.deals.map((d) => (
          <div key={d.id} style={{ marginBottom: 6 }}>
            {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="strong">{d.no}</a> : <span className="strong">{d.no}</span>}
            <span className="muted"> · {d.stage}</span>
            <div className="sub">{d.route}</div>
            {!done && !r.sub && d.canApprove ? (
              <button type="button" className="btn outline sm" style={{ marginTop: 4 }} disabled={pending} onClick={() => run(() => approveJointDeal(expId, d.id))}>
                Marcar como passageiros
              </button>
            ) : null}
          </div>
        ))}
      </td>
      <td className="small">
        {r.deals.map((d) => (d.fix ? <div key={d.id} style={{ marginBottom: 4 }}>{d.fix}</div> : null))}
      </td>
      <td>
        {done ? (
          <button type="button" className="btn ghost sm" disabled={pending} onClick={() => run(() => setPersonReviewed(expId, r.key, r.name, false))}>
            Voltar para a conferir
          </button>
        ) : r.canConfer ? (
          <button type="button" className="btn outline sm" disabled={pending} onClick={() => run(() => setPersonReviewed(expId, r.key, r.name, true))}>
            Marcar como conferido
          </button>
        ) : null}
        {err ? <div className="sub" role="alert" style={{ color: "var(--red-700)" }}>{err}</div> : null}
      </td>
    </tr>
  );
}
