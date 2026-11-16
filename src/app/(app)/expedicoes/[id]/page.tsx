import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Kpi, Tip } from "@/components/ui";
import { dealStage, expEnd, expStatus, isDone, PRODUCTS, STAGES, stageOf, type Product } from "@/lib/commission";
import { dealNo, PENDING, RULE_TIP, sortPassengers, type Resolved } from "@/lib/matching";
import { cityLabel } from "@/lib/cities";
import { loadWorld, requireSession } from "@/lib/data";
import { brl, dm, fmtDate, plural } from "@/lib/format";
import { airportLabel } from "@/components/AirportOptions";
import { FinishExpedition } from "./forms";
import { ClientsTable, type TableRow } from "./ClientsTable";
import { DealGroups } from "./DealGroups";
import type { DealView } from "./DealRow";
import type { ProductDeal } from "./ProductCell";

export const metadata = { title: "Expedição" };

export default async function ExpeditionPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const [{ id }, world] = await Promise.all([params, loadWorld()]);
  const exp = world.exps.find((e) => e.id === id);
  if (!exp) notFound();

  const { ledger } = world;
  const isVay = s.isVay;
  const partner = world.partners.find((p) => p.id === exp.partner_id);
  const t = ledger.expStats(exp);
  const st = expStatus(exp);
  const portal = process.env.HUBSPOT_PORTAL_ID ?? "44656712";
  const hsUrl = (hid: string | null) => (isVay && hid ? `https://app.hubspot.com/contacts/${portal}/record/0-3/${hid}` : null);
  const closing = world.entries.find((e) => e.expedition_id === exp.id);
  const released = exp.finished_at ? Number(closing?.amount ?? 0) : null;

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

  const expDeals = isVay
    ? ledger.resolved.filter(
        (r) => r.deal.signaled !== false && ((r.exp && r.exp.id === exp.id) || (!r.exp && r.needsReview && r.partner?.id === exp.partner_id)),
      )
    : [];
  const pending = isVay ? ledger.pendingFor(exp) : 0;
  const unsignaled = isVay ? ledger.unsignaledFor(exp) : [];

  const productsOf = (d: Resolved["deal"]) =>
    PRODUCTS.filter((k) => d[k] > 0).map((k) => `${k === "voo" ? "Voo" : k === "hotel" ? "Hospedagem" : "Seguro"} ${brl(d[k])}`).join(" · ") || "—";
  const view = (r: Resolved): DealView => {
    const d = r.deal;
    const unsig = d.signaled === false;
    const legs = d.legs;
    const sg = stageOf(dealStage(d));
    const others = r.candIds.slice(1).map((cid) => world.exps.find((e) => e.id === cid)?.name).filter(Boolean);
    return {
      id: d.id,
      no: dealNo(d),
      name: d.name,
      hubspotUrl: hsUrl(d.hubspot_id),
      stage: { label: sg.label, tone: sg.tone },
      flags: r.flags.map((f) => ({ key: f.key, label: f.label, tone: f.tone, pending: PENDING.includes(f.key) })),
      needsReview: r.needsReview,
      passengers: sortPassengers(d.passengers).map((p) => ({
        id: p.id,
        name: p.name,
        strong: p.is_titular,
        note: p.is_buyer && !p.is_passenger ? "comprador, não viaja" : p.is_buyer ? "comprador" : p.is_titular ? "titular" : "",
      })),
      routeShort: legs.length ? `${legs[0].city} → ${legs[legs.length - 1].city} · ${dm(legs[0].date)}–${dm(d.end_date)}` : "",
      route: `${legs.map((l) => `${l.city} ${dm(l.date)}`).join(" → ")} · volta ${fmtDate(d.end_date)}`,
      closedOn: d.closed_on ? fmtDate(d.closed_on) : "",
      products: productsOf(d),
      payment: d.payment_methods.length ? d.payment_methods.join(" + ") : "não informado no HubSpot",
      reason: r.reason + (others.length ? ` Outras expedições compatíveis: ${others.join(", ")}.` : ""),
      com: unsig ? r.potential.total : r.com.total,
      comLabel: unsig
        ? "Comissão se for sinalizado"
        : d.stage_kind !== "won"
          ? "Ainda não comprou"
          : r.exp
            ? r.flags.some((f) => f.key === "misto")
              ? "Cashback a definir"
              : "Cashback do parceiro"
            : "Sem expedição · não remunera",
      fixes: unsig ? r.fixes : undefined,
    };
  };

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
              ? `Liberado em ${fmtDate(exp.finished_at.slice(0, 10))}${isVay && exp.finished_by_name ? ` por ${exp.finished_by_name}` : ""}`
              : "A liberar · entra no saldo quando a Vay Agora finalizar a expedição"
          }
        />
        <Kpi label="Em negociação" value={String(t.stages.negociacao ?? 0)} sub={`${t.stages.em_contato ?? 0} em contato · ${t.stages.perdido ?? 0} não compraram`} />
      </div>

      <section className="card">
        <div className="card-head">
          <div className="ttl">
            <h2 className="section-title">Clientes da expedição</h2>
            <Tip>
              Passageiros dos negócios da agência no HubSpot com destino e datas desta expedição. A etapa vem da etapa do
              negócio e a observação, do campo “Observações para parceiro”. Para corrigir qualquer dado, altere no HubSpot.
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

      {isVay ? (
        <section className="card pad stack" id="negocios">
          <div className="ttl">
            <h2 className="section-title">Negócios do HubSpot</h2>
            <Tip>{RULE_TIP}</Tip>
            {pending ? <Badge tone="red">{pending} para corrigir no HubSpot</Badge> : null}
          </div>
          {expDeals.length === 0 ? <p className="muted">Nenhum negócio do HubSpot vinculado a esta expedição ainda.</p> : null}
          <DealGroups views={expDeals.map((r) => view(r))} pendingTitle="Corrigir no HubSpot" restTitle="Negócios vinculados" />
        </section>
      ) : null}

      {isVay && unsignaled.length ? (
        <section className="card pad stack" id="nao-sinalizados" style={{ borderColor: "var(--red-300)" }}>
          <div className="ttl">
            <h2 className="section-title">Encontrados, mas não sinalizados no HubSpot</h2>
            <Tip>
              Negócios ganhos ou em aberto com destino e datas compatíveis com esta expedição, mas sem a marcação de agência
              parceira no HubSpot (Origem do Negócio + empresa associada). Não aparecem para o parceiro e não geram comissão.
              Corrigidos no HubSpot, passam para a lista acima na próxima sincronização. Só a equipe Vay Agora vê esta seção.
            </Tip>
            <Badge tone="red">{unsignaled.length}</Badge>
          </div>
          <DealGroups views={unsignaled.map((r) => view(r))} pendingTitle="Corrigir no HubSpot" restTitle="Outros" />
        </section>
      ) : null}
    </>
  );
}
