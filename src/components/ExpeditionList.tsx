import Link from "next/link";
import { cityLabel } from "@/lib/cities";
import { expEnd, isDone } from "@/lib/commission";
import type { World } from "@/lib/data";
import { brl, dayNum, dm, plural, todayIso } from "@/lib/format";
import type { Expedition } from "@/lib/types";

// Lista empilhada de expedições (protótipo v37). Em andamento/próximas pela data de início mais próxima;
// concluídas (data de fim já passou) numa seção recolhível, da mais recente para a mais antiga.
export function ExpeditionList({
  exps,
  world,
  isVay,
  showPartner,
  emptyText,
}: {
  exps: Expedition[];
  world: World;
  isVay: boolean;
  showPartner: boolean;
  emptyText: string;
}) {
  const today = dayNum(todayIso());
  const active = exps
    .filter((e) => !isDone(e))
    .sort((a, b) => Math.abs(dayNum(a.start_date) - today) - Math.abs(dayNum(b.start_date) - today) || (a.start_date < b.start_date ? -1 : 1));
  const done = exps.filter(isDone).sort((a, b) => (expEnd(a) < expEnd(b) ? 1 : -1));
  // Expedição finalizada: vale o valor congelado no fechamento (extrato); senão, o ganho atual (a liberar)
  const earned = (e: Expedition) =>
    e.finished_at ? Number(e.finished_amount ?? 0) : world.ledger.earnings(e.id).total;
  const doneTotal = done.reduce((a, e) => a + earned(e), 0);
  const partnerName = (e: Expedition) => world.partners.find((p) => p.id === e.partner_id)?.name ?? "";

  const Row = ({ e, finished }: { e: Expedition; finished?: boolean }) => {
    const t = world.ledger.expStats(e);
    const pctDone = t.n ? Math.round((t.closed / t.n) * 100) : 0;
    return (
      <Link href={`/expedicoes/${e.id}`} className={`card erow${finished ? " done" : ""}`} aria-label={`Abrir a expedição ${e.name}`}>
        <span className="stack" style={{ gap: 2, flex: "1 1 300px", minWidth: 0 }}>
          <span className="strong" style={{ fontSize: 16 }}>{e.name}</span>
          <span className="meta">
            <span>{cityLabel(e.city)}</span>
            <span>{dm(e.start_date)} a {dm(expEnd(e))}</span>
            <span>{plural(Number(e.days), "dia", "dias")}</span>
            <span>{plural(t.n, "cliente", "clientes")}</span>
            {showPartner ? <span>{partnerName(e)}</span> : null}
          </span>
        </span>
        <span className="stack" style={{ gap: 4, flex: "0 1 220px", minWidth: 160 }}>
          <span className="row small" style={{ justifyContent: "space-between" }}>
            <span className="muted">Compra concluída</span>
            <span className="strong">{t.closed} de {t.n}</span>
          </span>
          <span className="bar" style={{ display: "block" }}><span style={{ width: `${pctDone}%` }} /></span>
        </span>
        <span className="stack" style={{ gap: 0, flex: "0 0 auto", minWidth: 140, textAlign: "right" }}>
          <span className="small muted">{isVay ? "Comissão do parceiro" : "Seus ganhos (total)"}</span>
          <span className="display" style={{ fontSize: 18, color: "var(--text-strong)" }}>{brl(earned(e))}</span>
          {earned(e) > 0 || e.finished_at ? (
            <span className={`small ${e.finished_at ? "highlight" : "muted"}`}>{e.finished_at ? "Apurado" : "A liberar"}</span>
          ) : null}
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)", flex: "none" }}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </Link>
    );
  };

  if (!exps.length) return <div className="card empty">{emptyText}</div>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {active.map((e) => <Row key={e.id} e={e} />)}
      {!active.length ? <div className="card empty">Nenhuma expedição em andamento ou programada.</div> : null}
      {done.length ? (
        <details className="done-sec">
          <summary className="done-toggle">
            <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            <span className="strong" style={{ fontSize: 14, color: "var(--text-body)" }}>Expedições concluídas</span>
            <span className="badge neutral">{done.length}</span>
            <span className="small muted" style={{ marginLeft: "auto" }}>
              {isVay ? "Comissões do parceiro: " : "Seus ganhos: "}{brl(doneTotal)}
            </span>
          </summary>
          <div className="stack done-list">
            {done.map((e) => <Row key={e.id} e={e} finished />)}
          </div>
        </details>
      ) : null}
    </div>
  );
}
