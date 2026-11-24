import Link from "next/link";
import type { Statement } from "@/lib/balance";
import { brl, fmtDate, plural } from "@/lib/format";
import type { Partner } from "@/lib/types";
import { Badge, Tip } from "./ui";

// Extrato do saldo (mesmo padrão do Portal do Comissário): saldo em destaque, entradas, saídas e a lista.
export function BalanceStatement({
  partner,
  statement,
  toRelease,
  isVay,
  basePath,
  filter,
}: {
  partner: Partner;
  statement: Statement;
  // Ganho das expedições ainda não concluídas
  toRelease: { id: string; name: string; total: number }[];
  isVay: boolean;
  basePath: string;
  filter: "all" | "in" | "out";
}) {
  const rows = statement.rows.filter((r) => filter === "all" || r.kind === filter);
  const tabs: [typeof filter, string][] = [["all", "Tudo"], ["in", "Entradas"], ["out", "Saídas"]];
  return (
    <>
      <div className="page-head">
        <div>
          {isVay ? <Link href={`/parceiros/${partner.id}`} className="back">← Painel de {partner.name}</Link> : null}
          <div className="eyebrow">Saldo</div>
          <div className="ttl">
            <h1 className="page-title">Extrato</h1>
            <Tip>
              Saldo e lançamentos dos seus créditos na Vay Agora. Os créditos de cada expedição são lançados depois que ela
              termina e a equipe Vay Agora confirma que aconteceu. Até lá, aparecem como “a liberar”.
            </Tip>
          </div>
        </div>
      </div>

      <section className="grid-kpi">
        <div className="card kpi accent">
          <div className="label">Saldo atual</div>
          <div className="value" style={{ fontSize: 40 }}>{brl(statement.balance)}</div>
          <div className="sub">{isVay ? "“Créditos abertos” da empresa no HubSpot" : "Entradas menos saídas"}</div>
        </div>
        <div className="card kpi">
          <div className="label">Total recebido</div>
          <div className="value amount-in">{brl(statement.totalIn)}</div>
          <div className="sub">{plural(statement.countIn, "entrada", "entradas")}</div>
        </div>
        <div className="card kpi">
          <div className="label">A liberar</div>
          <div className="value">{brl(toRelease.reduce((a, x) => a + x.total, 0))}</div>
          <div className="sub">
            {toRelease.length
              ? `${plural(toRelease.length, "expedição aguardando", "expedições aguardando")} fechamento`
              : "Nenhuma expedição aguardando fechamento"}
          </div>
        </div>
      </section>

      {toRelease.length ? (
        <section className="card">
          <div className="card-head">
            <h2 className="section-title">A liberar</h2>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Expedição</th><th className="num">Valor</th></tr>
              </thead>
              <tbody>
                {toRelease.map((x) => (
                  <tr key={x.id}>
                    <td><Link href={`/expedicoes/${x.id}`}>{x.name}</Link></td>
                    <td className="num">{brl(x.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {partner.credit_synced_at === null || partner.credit_synced_at === undefined ? (
        <div className="notice" role="status">
          {isVay
            ? "O saldo desta agência ainda não veio do HubSpot. Rode “Sincronizar agora” na Visão geral e confira a mensagem de créditos."
            : "Seu saldo está sendo atualizado pela equipe Vay Agora."}
        </div>
      ) : null}

      {isVay && statement.gap !== 0 ? (
        <div className="notice" role="status">
          O saldo do HubSpot difere da soma dos lançamentos em {brl(statement.gap)}. Confira no HubSpot o campo “Créditos abertos”
          e os registros de Créditos da empresa.
        </div>
      ) : null}

      <section className="card">
        <div className="card-head">
          <h2 className="section-title">Lançamentos</h2>
          <div className="row" role="group" aria-label="Filtrar extrato" style={{ gap: 8 }}>
            {tabs.map(([id, label]) => (
              <Link
                key={id}
                href={id === "all" ? basePath : `${basePath}?f=${id}`}
                className={`btn sm ${filter === id ? "secondary" : "outline"}`}
                aria-current={filter === id ? "true" : undefined}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="tbl" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Origem</th>
                <th className="num">Valor</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{fmtDate(r.date)}</td>
                  <td><Badge tone={r.kind === "in" ? "success" : "purple"}>{r.kind === "in" ? "Entrada" : "Saída"}</Badge></td>
                  <td>
                    <span className="strong">{r.title}</span>
                    {r.sub ? <div className="sub">{r.sub}</div> : null}
                  </td>
                  <td className="small muted">{r.origin}</td>
                  <td className={`num ${r.kind === "in" ? "amount-in" : "amount-out"}`}>{r.amount >= 0 ? "+ " : "− "}{brl(Math.abs(r.amount))}</td>
                  <td className="num muted">{brl(r.balance)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="empty">Nenhum lançamento por aqui ainda.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
