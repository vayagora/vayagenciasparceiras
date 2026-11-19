"use client";

// Conferência da expedição (só Vay, SPEC 2.1). A Vay só alterna entre "A conferir" e "Conferidos";
// para ir a "Passageiros", corrige no HubSpot e a próxima sincronização leva a pessoa para a lista.
import { useState, useTransition } from "react";
import type { Tone } from "@/lib/commission";
import { setPersonReviewed } from "../../actions";

export type ReviewRow = {
  key: string;
  name: string;
  email: string;
  reasons: { label: string; tone: Tone }[];
  deals: { no: string; url: string | null; stage: string; route: string; fix: string }[];
  reviewed: string | null; // "Conferido por X em dd/mm/aaaa"
};

export function ReviewTable({ expId, rows, done, emptyText }: { expId: string; rows: ReviewRow[]; done: boolean; emptyText: string }) {
  return (
    <div className="table-wrap">
      <table className="tbl" style={{ minWidth: 860 }}>
        <thead>
          <tr>
            <th>Passageiro</th>
            <th>Motivo</th>
            <th>Negócio no HubSpot</th>
            <th>O que corrigir no HubSpot</th>
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
  const toggle = () =>
    start(async () => {
      const res = await setPersonReviewed(expId, r.key, r.name, !done);
      setErr(res?.error ?? "");
    });
  return (
    <tr style={{ opacity: pending ? 0.6 : 1 }}>
      <td>
        <span className="strong">{r.name}</span>
        {r.email ? <div className="sub">{r.email}</div> : null}
        {r.reviewed ? <div className="sub">{r.reviewed}</div> : null}
      </td>
      <td>
        <div className="stack" style={{ gap: 4, alignItems: "flex-start" }}>
          {r.reasons.map((x) => <span key={x.label} className={`badge ${x.tone}`}>{x.label}</span>)}
        </div>
      </td>
      <td>
        {r.deals.map((d) => (
          <div key={d.no} style={{ marginBottom: 4 }}>
            {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="strong">{d.no}</a> : <span className="strong">{d.no}</span>}
            <span className="muted"> · {d.stage}</span>
            <div className="sub">{d.route}</div>
          </div>
        ))}
      </td>
      <td className="small">
        {r.deals.map((d) => <div key={d.no} style={{ marginBottom: 4 }}>{d.fix}</div>)}
      </td>
      <td>
        <button type="button" className={`btn sm ${done ? "ghost" : "outline"}`} disabled={pending} onClick={toggle}>
          {done ? "Voltar para a conferir" : "Marcar como conferido"}
        </button>
        {err ? <div className="sub" role="alert" style={{ color: "var(--red-700)" }}>{err}</div> : null}
      </td>
    </tr>
  );
}
