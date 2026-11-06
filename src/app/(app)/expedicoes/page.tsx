import Link from "next/link";
import { Badge } from "@/components/ui";
import { addMoney, expStatus, isDone, ZERO } from "@/lib/commission";
import { cityLabel } from "@/lib/cities";
import { loadWorld, requireSession, type World } from "@/lib/data";
import { brl, fmtDate } from "@/lib/format";
import type { Expedition } from "@/lib/types";
import { NewExpeditionForm } from "./NewExpeditionForm";
import { PartnerFilter } from "./PartnerFilter";

export const metadata = { title: "Expedições" };

export default async function ExpeditionsPage({
  searchParams,
}: {
  searchParams: Promise<{ parceiro?: string; nova?: string; finalizadas?: string }>;
}) {
  const s = await requireSession();
  const [world, sp] = await Promise.all([loadWorld(), searchParams]);
  const filter = s.isVay && sp.parceiro ? sp.parceiro : "all";
  const list = world.exps.filter((e) => filter === "all" || e.partner_id === filter);
  const active = list.filter((e) => !isDone(e));
  const done = list.filter(isDone).reverse();
  const doneCom = done.reduce((a, e) => addMoney(a, world.ledger.expStats(e)), ZERO).total;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{s.isVay ? "Todas as expedições dos parceiros" : "Suas expedições"}</div>
          <h1 className="page-title">Expedições</h1>
        </div>
        <div className="row">
          {s.isVay ? <PartnerFilter partners={world.partners} value={filter} /> : null}
          <Link href="/expedicoes?nova=1" className="btn primary">Iniciar expedição</Link>
        </div>
      </div>

      {sp.nova ? <NewExpeditionForm partners={s.isVay ? world.partners : undefined} /> : null}

      {active.length ? (
        <div className="grid-exps">
          {active.map((e) => <ExpCard key={e.id} e={e} world={world} isVay={s.isVay} />)}
        </div>
      ) : (
        <div className="card empty">
          {done.length ? "Nenhuma expedição em andamento ou programada." : "Nenhuma expedição por aqui ainda."}
        </div>
      )}

      {done.length ? (
        <details className="card" open={!!sp.finalizadas}>
          <summary className="card-head" style={{ cursor: "pointer", listStyle: "none" }}>
            <div className="stack" style={{ gap: 2 }}>
              <h2 className="section-title">Expedições finalizadas · {done.length}</h2>
              <span className="small muted">{s.isVay ? "Comissões dos parceiros: " : "Seus ganhos: "}{brl(doneCom)}</span>
            </div>
            <span className="btn outline sm">Mostrar / recolher</span>
          </summary>
          <div className="grid-exps" style={{ padding: "0 24px 24px" }}>
            {done.map((e) => <ExpCard key={e.id} e={e} world={world} isVay={s.isVay} />)}
          </div>
        </details>
      ) : null}
    </>
  );
}

function ExpCard({ e, world, isVay }: { e: Expedition; world: World; isVay: boolean }) {
  const t = world.ledger.expStats(e);
  const st = expStatus(e);
  const pending = isVay ? world.ledger.pendingFor(e) : 0;
  const partner = world.partners.find((p) => p.id === e.partner_id);
  return (
    <Link href={`/expedicoes/${e.id}`} className="card expcard">
      <div className="row" style={{ gap: 8 }}>
        <Badge tone={st.tone} dot>{st.label}</Badge>
        {isVay ? <Badge tone="neutral">{partner?.name}</Badge> : null}
        {pending ? <Badge tone="yellow">{pending} para conferir</Badge> : null}
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <h3>{e.name}</h3>
        <span className="muted">{cityLabel(e.city)}</span>
      </div>
      <div className="meta">
        <span>Início {fmtDate(e.start_date)}</span>
        <span>{e.days} dias</span>
        <span>{t.n} clientes</span>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row small" style={{ justifyContent: "space-between" }}>
          <span>Clientes com compra concluída</span>
          <span className="strong">{t.closed} de {t.n}</span>
        </div>
        <div className="bar"><span style={{ width: `${t.n ? Math.round((t.closed / t.n) * 100) : 0}%` }} /></div>
      </div>
      <div className="row" style={{ justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
        <span className="small muted">{isVay ? "Comissão do parceiro" : "Seus ganhos (total)"}</span>
        <span className="display" style={{ fontSize: 20, color: "var(--text-strong)" }}>{brl(t.total)}</span>
      </div>
    </Link>
  );
}
