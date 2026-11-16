import Link from "next/link";
import { Tip } from "@/components/ui";
import { loadWorld, requireVay } from "@/lib/data";
import { NewPartnerButton } from "./forms";

export const metadata = { title: "Parceiros" };

export default async function PartnersPage() {
  await requireVay();
  const { partners, exps, ledger } = await loadWorld();
  const rows = partners.map((p) => {
    const ex = exps.filter((e) => e.partner_id === p.id);
    return { p, exps: ex.length, clients: ex.reduce((a, e) => a + ledger.lines(e).length, 0) };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Sistema de Agências Parceiras</div>
          <div className="ttl">
            <h1 className="page-title">Parceiros</h1>
            <Tip>
              Cada parceiro enxerga apenas as próprias expedições e os clientes dos negócios da própria agência no HubSpot. O nome
              (afiliado) precisa ser igual ao nome da empresa associada aos negócios no HubSpot.
            </Tip>
          </div>
        </div>
        <NewPartnerButton />
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {rows.map(({ p, exps, clients }) => (
          <Link key={p.id} href={`/parceiros/${p.id}`} className="card prow" aria-label={`Abrir o painel de ${p.name}`}>
            <span className="strong" style={{ fontSize: 16, flex: "1 1 240px", minWidth: 0 }}>{p.name}</span>
            <span className="pstat"><span className="display">{exps}</span><span className="small muted">{exps === 1 ? "expedição" : "expedições"}</span></span>
            <span className="pstat"><span className="display">{clients}</span><span className="small muted">{clients === 1 ? "cliente" : "clientes"}</span></span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)", flex: "none" }}>
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        ))}
        {rows.length === 0 ? <div className="card empty">Nenhum parceiro cadastrado ainda.</div> : null}
      </div>
    </>
  );
}
