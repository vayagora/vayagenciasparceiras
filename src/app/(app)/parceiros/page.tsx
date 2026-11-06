import Link from "next/link";
import { Tip } from "@/components/ui";
import { addMoney, ZERO } from "@/lib/commission";
import { loadWorld, requireVay } from "@/lib/data";
import { brlShort } from "@/lib/format";
import { InviteVayUser, NewPartnerForm } from "./forms";

export const metadata = { title: "Parceiros" };

export default async function PartnersPage() {
  await requireVay();
  const { partners, exps, ledger } = await loadWorld();
  const rows = partners.map((p) => {
    const ex = exps.filter((e) => e.partner_id === p.id);
    const st = ex.map((e) => ledger.expStats(e));
    return {
      p,
      exps: ex.length,
      clients: st.reduce((a, t) => a + t.n, 0),
      com: st.reduce((a, t) => addMoney(a, t), ZERO).total,
    };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Painel Vay Agora</div>
          <div className="ttl">
            <h1 className="page-title">Parceiros</h1>
            <Tip>
              Cada parceiro enxerga apenas as próprias expedições e os clientes que cadastrou. O afiliado precisa ser igual à opção do campo “afiliado” no HubSpot.
            </Tip>
          </div>
        </div>
      </div>

      <div className="grid-exps">
        {rows.map(({ p, exps, clients, com }) => (
          <div key={p.id} className="card expcard">
            <div className="stack" style={{ gap: 2 }}>
              <h3>{p.name}</h3>
              <span className="small muted">{p.contact_email ?? "Sem e-mail de contato"}</span>
            </div>
            <div className="row" style={{ gap: 24 }}>
              <Stat value={String(exps)} label="expedições" />
              <Stat value={String(clients)} label="clientes" />
              <Stat value={brlShort(com)} label="comissão" />
            </div>
            <div className="row">
              <Link href={`/parceiros/${p.id}`} className="btn secondary sm">Ver painel</Link>
              <Link href={`/expedicoes?parceiro=${p.id}`} className="btn ghost sm">Ver expedições</Link>
            </div>
          </div>
        ))}
        {rows.length === 0 ? <p className="muted">Nenhum parceiro cadastrado ainda.</p> : null}
      </div>

      <section className="card pad stack">
        <h2 className="section-title">Novo parceiro</h2>
        <p className="muted small">Se informar o e-mail, a pessoa recebe um convite para criar a senha e entrar no portal.</p>
        <NewPartnerForm />
      </section>

      <section className="card pad stack">
        <h2 className="section-title">Equipe Vay Agora</h2>
        <p className="muted small">Convide consultores para acessar o painel interno.</p>
        <InviteVayUser />
      </section>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stack" style={{ gap: 0 }}>
      <span className="display" style={{ fontSize: 22, color: "var(--text-strong)" }}>{value}</span>
      <span className="small muted">{label}</span>
    </div>
  );
}
