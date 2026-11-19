import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Kpi, Tip } from "@/components/ui";
import { dealStage, expEnd, expStatus, isDone, PRODUCTS, STAGES, stageOf, type Product } from "@/lib/commission";
import { dealNo, RULE_TIP, type Resolved } from "@/lib/matching";
import type { ReviewPerson } from "@/lib/ledger";
import { cityLabel } from "@/lib/cities";
import { loadWorld, requireSession } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { brl, dm, fmtDate, plural } from "@/lib/format";
import { airportLabel } from "@/components/AirportOptions";
import { FinishExpedition } from "./forms";
import { ClientsTable, type TableRow } from "./ClientsTable";
import { ReviewTable, type ReviewRow } from "./ReviewTable";
import type { ProductDeal } from "./ProductCell";

export const metadata = { title: "Expedição" };

export default async function ExpeditionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const s = await requireSession();
  const [{ id }, sp, world] = await Promise.all([params, searchParams, loadWorld()]);
  const exp = world.exps.find((e) => e.id === id);
  if (!exp) notFound();

  const { ledger } = world;
  const isVay = s.isVay;
  const partner = world.partners.find((p) => p.id === exp.partner_id);
  const t = ledger.expStats(exp);
  const st = expStatus(exp);
  const portal = process.env.HUBSPOT_PORTAL_ID ?? "44656712";
  const hsUrl = (hid: string | null) => (isVay && hid ? `https://app.hubspot.com/contacts/${portal}/record/0-3/${hid}` : null);
  const released = exp.finished_at ? Number(exp.finished_amount ?? 0) : null;

  const pd = (r: Resolved, value: number | null): ProductDeal => ({ id: r.deal.id, no: dealNo(r.deal), value, details: r.deal.details ?? {} });
  const won = (rs: Resolved[]) => rs.filter((r) => r.deal.stage_kind === "won");
  const tableRows: TableRow[] = ledger.lines(exp).map((l) => {
    const sg = stageOf(l.stage);
    const primaryWon = won(l.primary);
    return {
      key: l.key,
      name: l.name,
      email: l.email,
      phone: l.phone,
      stage: { id: l.stage, label: sg.label, tone: sg.tone, sub: l.boughtBy.length ? `comprado por ${l.boughtBy.join(", ")}` : undefined },
      deals: l.deals.map((r) => ({ no: dealNo(r.deal), url: hsUrl(r.deal.hubspot_id), stage: stageOf(dealStage(r.deal)).label })),
      prods: PRODUCTS.map((k: Product) => ({
        product: k,
        primary: primaryWon.filter((r) => Number(r.deal[k]) > 0).map((r) => pd(r, Number(r.deal[k]))),
        included: won(l.included).filter((r) => Number(r.deal[k]) > 0).map((r) => pd(r, null)),
      })),
      com: primaryWon.length ? l.com.total : null,
      hsNote: l.note,
    };
  });

  // Parceiro: só os nomes das pendências de lançamento (negócios da agência com vários passageiros, não conferidos)
  let pendingNames: string[] = [];
  if (!isVay) {
    const { data } = await (await createClient()).rpc("partner_pending_names", { exp_id: exp.id });
    pendingNames = ((data ?? []) as { person_name: string }[]).map((x) => x.person_name).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  // Conferência (só Vay): abas A conferir / Conferidos
  const queue = isVay ? ledger.reviewQueue(exp) : { pending: [], done: [] };
  const tab = isVay && (sp.aba === "conferir" || sp.aba === "conferidos") ? sp.aba : "passageiros";
  const routeOf = (d: Resolved["deal"]) =>
    d.legs.length ? `${d.legs.map((l) => `${l.city} ${dm(l.date)}`).join(" → ")} · volta ${fmtDate(d.end_date)}` : "";
  const reviewRow = (p: ReviewPerson): ReviewRow => ({
    key: p.key,
    name: p.name,
    email: p.email,
    reasons: p.reasons.map((x) =>
      x === "varios"
        ? { label: "Vários passageiros no negócio", tone: "yellow" as const }
        : { label: "Não sinalizado no HubSpot", tone: "red" as const },
    ),
    deals: p.deals.map((r) => ({
      no: dealNo(r.deal),
      url: hsUrl(r.deal.hubspot_id),
      stage: stageOf(dealStage(r.deal)).label,
      route: routeOf(r.deal),
      fix:
        r.deal.signaled === false
          ? r.fixes.length
            ? `${dealNo(r.deal)}: ${r.fixes.join("; ")}.`
            : `${dealNo(r.deal)}: confira a origem e a empresa associada.`
          : `${dealNo(r.deal)}: deixar um passageiro por negócio (${r.deal.passengers.filter((x) => x.is_passenger !== false).length} hoje).`,
    })),
    reviewed: p.review
      ? `Conferido${p.review.reviewed_by_name ? ` por ${p.review.reviewed_by_name}` : ""} em ${fmtDate(p.review.reviewed_at.slice(0, 10))}`
      : null,
  });
  const tabs: [string, string, number][] = [
    ["passageiros", "Passageiros", t.n],
    ["conferir", "A conferir", queue.pending.length],
    ["conferidos", "Conferidos", queue.done.length],
  ];

  return (
    <>
      <div className="page-head">
        <div>
          {isVay && partner ? (
            <Link href={`/parceiros/${partner.id}`} className="back">← Painel de {partner.name}</Link>
          ) : (
            <Link href="/expedicoes" className="back">← Expedições</Link>
          )}
          <div className="row" style={{ gap: 8 }}>
            {exp.finished_at ? <Badge tone="success" dot>Finalizada</Badge> : <Badge tone={st.tone} dot>{st.label}</Badge>}
            {isVay && partner ? <Link href={`/parceiros/${partner.id}`}><Badge tone="neutral">{partner.name}</Badge></Link> : null}
          </div>
          <h1 className="page-title">{exp.name}</h1>
          <div className="meta">
            <span>Destino: <strong>{cityLabel(exp.city)}</strong></span>
            <span>Início: <strong>{fmtDate(exp.start_date)}</strong></span>
            <span>Fim: <strong>{fmtDate(expEnd(exp))}</strong></span>
            {exp.arrival_airport ? <span>Chegada: <strong>{airportLabel(exp.arrival_airport)}</strong></span> : null}
            {exp.departure_airport ? <span>Saída: <strong>{airportLabel(exp.departure_airport)}</strong></span> : null}
          </div>
        </div>
        {isVay && !exp.finished_at && isDone(exp) ? (
          <FinishExpedition expId={exp.id} expName={exp.name} total={brl(t.total)} deals={t.deals} />
        ) : null}
      </div>

      <div className="grid-kpi">
        <Kpi
          label="Clientes"
          value={String(t.n)}
          sub={<span className="highlight">{plural(t.closed, "compra concluída", "compras concluídas")}</span>}
        />
        <Kpi
          accent
          label={isVay ? "Comissão do parceiro" : "Seus ganhos nesta expedição"}
          value={brl(released ?? t.total)}
          sub={
            exp.finished_at
              ? `Apurado em ${fmtDate(exp.finished_at.slice(0, 10))}${isVay && exp.finished_by_name ? ` por ${exp.finished_by_name}` : ""} · lançado em créditos pela Vay Agora`
              : "A liberar · vira crédito quando a Vay Agora finalizar a expedição"
          }
        />
        <Kpi label="Em negociação" value={String(t.stages.negociacao ?? 0)} sub={`${t.stages.em_contato ?? 0} em contato · ${t.stages.perdido ?? 0} não compraram`} />
      </div>

      {isVay ? (
        <nav className="row" role="tablist" aria-label="Seções da expedição" style={{ gap: 8 }}>
          {tabs.map(([key, label, n]) => (
            <Link
              key={key}
              href={key === "passageiros" ? `/expedicoes/${exp.id}` : `/expedicoes/${exp.id}?aba=${key}`}
              role="tab"
              aria-selected={tab === key}
              className={`btn sm ${tab === key ? "secondary" : "outline"}`}
            >
              {label} <span className={`badge ${key === "conferir" && n ? "red" : "neutral"}`}>{n}</span>
            </Link>
          ))}
          <Tip>{RULE_TIP}</Tip>
        </nav>
      ) : null}

      {tab === "passageiros" ? (
        <section className="card">
          <div className="card-head">
            <div className="ttl">
              <h2 className="section-title">{isVay ? "Passageiros" : "Clientes da expedição"}</h2>
              <Tip>
                Passageiros dos negócios da agência no HubSpot (Origem do Negócio + empresa associada, um passageiro por
                negócio) com destino e datas desta expedição. A etapa vem da etapa do negócio e a observação, do campo
                “Observações para parceiro”. Para corrigir qualquer dado, altere no HubSpot.
              </Tip>
            </div>
          </div>
          <ClientsTable
            rows={tableRows}
            earnHeader={isVay ? "Comissão" : "Seu ganho"}
            stageOptions={STAGES.map((x) => ({ value: x.id, label: x.label }))}
            expName={exp.name}
            emptyText="Nenhum negócio da agência no HubSpot para esta expedição ainda."
          />
        </section>
      ) : (
        <section className="card">
          <div className="card-head">
            <div className="ttl">
              <h2 className="section-title">{tab === "conferir" ? "A conferir" : "Conferidos"}</h2>
              <Tip>
                {tab === "conferir"
                  ? "Passageiros de negócios com destino e datas desta expedição que não vão direto para a lista: negócio da agência com mais de um passageiro, ou negócio não sinalizado no HubSpot. Se for erro no HubSpot, corrija lá: na próxima sincronização o passageiro vai para Passageiros. Se não for cliente desta expedição, marque como conferido."
                  : "Passageiros que a Vay já conferiu e que não são da lista desta expedição. Eles não voltam para “A conferir” nas próximas sincronizações."}
              </Tip>
            </div>
          </div>
          <ReviewTable
            expId={exp.id}
            rows={(tab === "conferir" ? queue.pending : queue.done).map(reviewRow)}
            done={tab === "conferidos"}
            emptyText={tab === "conferir" ? "Nada para conferir nesta expedição." : "Nenhum passageiro conferido ainda."}
          />
        </section>
      )}
      {!isVay && pendingNames.length ? (
        <section className="card pad stack" style={{ gap: 8 }}>
          <div className="ttl">
            <h2 className="section-title">Pendências de lançamento</h2>
            <Badge tone="yellow">{pendingNames.length}</Badge>
            <Tip>
              Passageiros desta expedição cujas compras a equipe Vay Agora ainda está organizando. Assim que forem lançadas,
              eles passam para a lista acima, com os valores e o seu ganho.
            </Tip>
          </div>
          <ul className="agr-list">
            {pendingNames.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </section>
      ) : null}
    </>
  );
}
