import { DealRow, type DealView } from "./DealRow";

// Pendências (corrigir no HubSpot) no topo; os demais recolhidos.
export function DealGroups({ views, pendingTitle, restTitle }: { views: DealView[]; pendingTitle: string; restTitle: string }) {
  const pending = views.filter((v) => v.needsReview);
  const rest = views.filter((v) => !v.needsReview);
  return (
    <>
      {pending.length ? (
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">{pendingTitle} · {pending.length}</span>
          {pending.map((v) => <DealRow key={v.id} v={v} />)}
        </div>
      ) : null}
      {rest.length ? (
        <details className="done-sec" open={!pending.length}>
          <summary className="done-toggle">
            <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            <span className="strong" style={{ fontSize: 14, color: "var(--text-body)" }}>{restTitle}</span>
            <span className="badge neutral">{rest.length}</span>
          </summary>
          <div className="stack done-list">
            {rest.map((v) => <DealRow key={v.id} v={v} />)}
          </div>
        </details>
      ) : null}
    </>
  );
}
