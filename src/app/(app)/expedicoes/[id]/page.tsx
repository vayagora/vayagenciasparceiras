import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Kpi, Tip } from "@/components/ui";
import { dealStage, expEnd, expStatus, isDone, PRODUCTS, STAGES, stageOf, type Product } from "@/lib/commission";
import { dealNo, RULE_TIP, type Resolved } from "@/lib/matching";
import { isJointDeal, type Mate, type PendingReason, type ReviewPerson } from "@/lib/ledger";
import { cityLabel } from "@/lib/cities";
import { loadWorld, requireSession } from "@/lib/data";
import { brl, dm, fmtDate, plural } from "@/lib/format";
import { airportLabel } from "@/components/AirportOptions";
import { ConcludeExpedition, ReopenExpedition } from "./forms";
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

  // Rastreio: onde estão os outros passageiros do mesmo negócio (só Vay)
  const WHERE: Record<Mate["where"], string> = { passageiros: "em Passageiros", conferidos: "em Conferidos", conferir: "em A conferir" };
  const matesTxt = (mates: Mate[]) =>
    isVay && mates.length ? `Mesmo negócio: ${mates.map((m) => `${m.name} (${m.dealNo}, ${WHERE[m.where]})`).join(" · ")}` : undefined;

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
      group: l.group,
      approved: l.approved.map((r) => ({ dealId: r.deal.id, no: dealNo(r.deal) })),
      matesTxt: matesTxt(l.mates),
    };
  });

  // Parceiro: só os nomes dos passageiros pendentes dos negócios da própria agência
  const partnerPending = isVay ? [] : ledger.agencyPendingPeople(exp.id).map((p) => p.name);

  // Conferência (só Vay): abas A conferir / Conferidos
  const queue = isVay ? ledger.reviewQueue(exp) : { pending: [], done: [] };
  const tab = isVay && (sp.aba === "conferir" || sp.aba === "conferidos") ? sp.aba : "passageiros";
  const routeOf = (d: Resolved["deal"]) =>
    d.legs.length ? `${d.legs.map((l) => `${l.city} ${dm(l.date)}`).join(" → ")} · volta ${fmtDate(d.end_date)}` : "";
  const REASON: Record<PendingReason, { label: string; tone: "yellow" | "red" | "neutral" }> = {
    conjunto: { label: "Negócio conjunto (vários passageiros)", tone: "yellow" },
    composicao: { label: "Mudou a composição do negócio", tone: "yellow" },
    nao_sinalizado: { label: "Não sinalizado no HubSpot", tone: "red" },
    outro: { label: "Pendência em outro negócio do grupo", tone: "neutral" },
  };
  const reviewRow = (p: ReviewPerson, i: number, all: ReviewPerson[]): ReviewRow => ({
    key: p.key,
    name: p.name,
    email: p.email,
    reasons: p.reasons.map((x) => REASON[x]),
    canConfer: p.deals.some((r) => r.deal.signaled === false),
    group: p.group,
    sub: i > 0 && all[i - 1].group === p.group,
    matesTxt: matesTxt(p.mates) ?? "",
    deals: p.deals.map((r) => ({
      id: r.deal.id,
      canApprove: r.deal.signaled !== false && isJointDeal(r.deal),
      no: dealNo(r.deal),
      url: hsUrl(r.deal.hubspot_id),
      stage: stageOf(dealStage(r.deal)).label,
      route: routeOf(r.deal),
      fix:
        r.deal.signaled === false
          ? r.fixes.length
            ? `${dealNo(r.deal)}: ${r.fixes.join("; ")}.`
            : `${dealNo(r.deal)}: confira a origem e a empresa associada.`
          : isJointDeal(r.deal)
            ? ledger.approvalOf(exp.id, r.deal.id)
              ? `${dealNo(r.deal)}: entrou ou saiu alguém do negócio desde a conferência. Confira e marque de novo.`
              : `${dealNo(r.deal)}: se todos viajam, “Marcar como passageiros”. Se alguém não viaja, separe os negócios no HubSpot.`
            : `${dealNo(r.deal)}: aguarda a conferência do outro negócio do passageiro.`,
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
            {exp.finished_at ? <Badge tone="success" dot>Concluída</Badge> : <Badge tone={st.tone} dot>{st.label}</Badge>}
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
        {isVay ? (
          exp.finished_at ? (
            <ReopenExpedition expId={exp.id} expName={exp.name} />
          ) : (
            <ConcludeExpedition
              expId={exp.id}
              expName={exp.name}
              total={brl(t.total)}
              deals={t.deals}
              ended={isDone(exp)}
              blocked={ledger.pendingAgencyDeals(exp.id).map((r) => ({
                no: dealNo(r.deal),
                names: r.deal.passengers.filter((x) => x.is_passenger !== false).map((x) => x.name),
              }))}
            />
          )
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
              ? `Expedição concluída em ${fmtDate(exp.finished_at.slice(0, 10))}${isVay && exp.finished_by_name ? ` por ${exp.finished_by_name}` : ""} · lançado em créditos pela Vay Agora`
              : "A liberar · vira crédito quando a Vay Agora concluir a expedição"
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
                Passageiros dos negócios da agência no HubSpot (Origem do Negócio + empresa associada) com destino e datas
                desta expedição. Quem está no mesmo negócio aparece junto, logo abaixo. A etapa vem da etapa do negócio e a
                observação, do campo “Observações para parceiro”. Para corrigir qualquer dado, altere no HubSpot.
              </Tip>
            </div>
          </div>
          <ClientsTable
            rows={tableRows}
            earnHeader={isVay ? "Comissão" : "Seu ganho"}
            stageOptions={STAGES.map((x) => ({ value: x.id, label: x.label }))}
            expName={exp.name}
            emptyText="Nenhum negócio da agência no HubSpot para esta expedição ainda."
            companionExpId={isVay ? exp.id : undefined}
          />
        </section>
      ) : (
        <section className="card">
          <div className="card-head">
            <div className="ttl">
              <h2 className="section-title">{tab === "conferir" ? "A conferir" : "Conferidos"}</h2>
              <Tip>
                {tab === "conferir"
                  ? "Passageiros com pendência nesta expedição: negócio conjunto da agência ainda não conferido (se todos viajam, “Marcar como passageiros”; se alguém não viaja, separe os negócios no HubSpot), composição que mudou, ou negócio não sinalizado no HubSpot (corrija lá ou marque como conferido). Quem está no mesmo negócio fica junto."
                  : "Passageiros de negócios não sinalizados que a Vay conferiu e que não são desta expedição. Não aparecem para o parceiro e não voltam nas próximas sincronizações; dá para desfazer."}
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
      {!isVay && partnerPending.length ? (
        <section className="card pad stack" style={{ gap: 8 }}>
          <div className="ttl">
            <h2 className="section-title">Pendências de lançamento</h2>
            <Badge tone="yellow">{partnerPending.length}</Badge>
            <Tip>
              Passageiros desta expedição cujas compras a equipe Vay Agora ainda está conferindo. Assim que forem conferidas,
              eles passam para a lista acima, com os valores e o seu ganho.
            </Tip>
          </div>
          <ul className="agr-list">
            {partnerPending.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </section>
      ) : null}
    </>
  );
}
