import Link from "next/link";
import type { Statement } from "@/lib/balance";
import { brl, fmtDate, plural } from "@/lib/format";
import type { Partner } from "@/lib/types";
import { AddEntryButton, DeleteEntryButton } from "./BalanceForms";
import { Badge, Tip } from "./ui";

// Extrato do saldo (mesmo padrão do Portal do Comissário): saldo em destaque, entradas, saídas e a lista.
export function BalanceStatement({
  partner,
  statement,
  isVay,
  basePath,
  filter,
}: {
  partner: Partner;
  statement: Statement;
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
              As comissões dos negócios vinculados às suas expedições entram sozinhas. A equipe Vay Agora lança bonificações
              (entradas) e o uso dos créditos (saídas).
            </Tip>
          </div>
        </div>
        {isVay ? <AddEntryButton partnerId={partner.id} partnerName={partner.name} balance={statement.balance} /> : null}
      </div>

      <section className="grid-kpi">
        <div className="card kpi accent">
          <div className="label">Saldo atual</div>
          <div className="value" style={{ fontSize: 40 }}>{brl(statement.balance)}</div>
          <div className="sub">{isVay ? "Igual ao que o parceiro vê no portal" : "Entradas menos saídas"}</div>
        </div>
        <div className="card kpi">
          <div className="label">Total recebido</div>
          <div className="value amount-in">{brl(statement.totalIn)}</div>
          <div className="sub">{plural(statement.countIn, "entrada", "entradas")}</div>
        </div>
        <div className="card kpi">
          <div className="label">Total gasto</div>
          <div className="value">{brl(statement.totalOut)}</div>
          <div className="sub">{plural(statement.countOut, "saída", "saídas")}</div>
        </div>
      </section>

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
                {isVay ? <th /> : null}
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
                  {isVay ? <td>{r.entryId ? <DeleteEntryButton entryId={r.entryId} /> : null}</td> : null}
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td colSpan={isVay ? 7 : 6} className="empty">Nenhum lançamento por aqui ainda.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
