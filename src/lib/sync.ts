// Sincronização HubSpot → Supabase (idempotente). Roda com a chave service_role, só no servidor.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  companyCredits,
  partnerCompanies,
  dealCompanies,
  dealContacts,
  hasLabel,
  isAgencyOrigem,
  matchPartner,
  paymentMethods,
  FIELDS,
  readLegsAny,
  searchActiveDealsInWindow,
  searchAgencyDeals,
  stageKind,
  hubspotConfig,
  pickTitular,
  readContacts,
  readTrip,
  toIsoDate,
  type Association,
  type HsContact,
  type HsDeal,
  type HubspotConfig,
} from "./hubspot";
import { expEnd } from "./commission";
import { dayNum, isoOf } from "./format";
import { DEFAULT_TOL, evalDeal, matchExpedition } from "./matching";
import type { DealDetails, Expedition, Leg, StageKind } from "./types";

export type PassengerRow = {
  hubspot_contact_id: string;
  name: string;
  email: string;
  phone: string;
  is_titular: boolean;
  is_buyer: boolean;
  is_passenger: boolean;
  first_seen_at: string;
  position: number;
};

// Monta os passageiros de um negócio a partir das associações (pura, testada).
export function planPassengers(
  assocs: Association[],
  contacts: Map<string, HsContact>,
  firstSeen: Map<string, string>,
  labels: string | string[] | { titular: string[]; buyer: string; passenger: string },
  now: string,
): { rows: PassengerRow[]; labeled: boolean } {
  const l = typeof labels === "object" && !Array.isArray(labels) ? labels : { titular: [labels].flat(), buyer: "Comprador", passenger: "Passageiro" };
  const { titularId, labeled } = pickTitular(assocs, l.titular, firstSeen, l.passenger);
  // Sem nenhum rótulo de passageiro no negócio, todos os contatos contam como passageiros.
  const anyPassenger = assocs.some((a) => hasLabel(a, l.passenger));
  const rows = assocs.map((a) => {
    const c = contacts.get(a.contactId);
    return {
      hubspot_contact_id: a.contactId,
      name: c?.name ?? "Contato sem nome",
      email: c?.email ?? "",
      phone: c?.phone ?? "",
      is_titular: a.contactId === titularId,
      is_buyer: hasLabel(a, l.buyer),
      is_passenger: !anyPassenger || hasLabel(a, l.passenger),
      first_seen_at: firstSeen.get(a.contactId) ?? now,
      position: a.order,
    };
  });
  return { rows, labeled };
}

// Negócio do HubSpot → linha de deals. O valor do negócio vai para a coluna do produto (Serviço).
export type DealRow = {
  hubspot_id: string;
  name: string;
  signaled: boolean;
  hs_origem: string;
  hs_agency: string;
  hs_stage: string;
  stage_kind: StageKind;
  partner_note: string;
  afiliado: string;
  closed_on: string | null;
  legs: Leg[];
  end_date: string;
  voo: number;
  hotel: number;
  seguro: number;
  details: DealDetails;
  payment_methods: string[];
};

type MapCfg = Pick<HubspotConfig, "origemProp" | "obsProp" | "wonStages" | "openStages" | "lostStages">;
const DEFAULT_MAP: MapCfg = {
  origemProp: "origem_do_negocio",
  obsProp: "observacoes_para_parceiro",
  wonStages: ["135525686"],
  openStages: ["appointmentscheduled", "qualifiedtobuy", "presentationscheduled", "135850329", "contractsent", "135525685"],
  lostStages: ["closedlost"],
};

// Sinalizado: afiliado = agência associada (parceiro). Não sinalizado: afiliado vazio (só a Vay vê),
// hsAgency = parceiro pela empresa associada, se houver.
// Negócio ganho precisa de serviço, valor e data de fechamento; em aberto ou perdido basta o roteiro
// (serviço e valor podem ainda não estar preenchidos).
export function mapDeal(
  d: HsDeal,
  afiliado: string | null,
  opts: { signaled?: boolean; hsAgency?: string; cfg?: Partial<MapCfg> } = {},
): { row: DealRow } | { skip: string } {
  const p = d.properties;
  const cfg = { ...DEFAULT_MAP, ...opts.cfg };
  const signaled = opts.signaled ?? true;
  if (signaled && !afiliado) return { skip: "sem empresa (agência) associada" };
  const kind = stageKind(cfg, p.dealstage) ?? "won";
  const closed = toIsoDate(p.closedate);
  if (kind === "won" && !closed) return { skip: "sem data de fechamento" };
  let trip = readTrip(p);
  if ("skip" in trip && kind !== "won") {
    const any = readLegsAny(p);
    if (any) trip = { product: "voo", value: 0, legs: any.legs, end: any.end, details: {} };
  }
  if ("skip" in trip) return { skip: trip.skip };
  return {
    row: {
      hubspot_id: d.id,
      name: String(p.dealname ?? "").trim(),
      signaled,
      hs_origem: String(p[cfg.origemProp] ?? "").trim(),
      hs_agency: opts.hsAgency ?? (signaled ? afiliado ?? "" : ""),
      hs_stage: String(p.dealstage ?? ""),
      stage_kind: kind,
      partner_note: String(p[cfg.obsProp] ?? "").trim(),
      afiliado: signaled ? afiliado! : "",
      closed_on: kind === "won" ? closed : null,
      legs: trip.legs,
      end_date: trip.end,
      voo: trip.product === "voo" ? trip.value : 0,
      hotel: trip.product === "hotel" ? trip.value : 0,
      seguro: trip.product === "seguro" ? trip.value : 0,
      details: trip.details,
      payment_methods: paymentMethods(p[FIELDS.payment]),
    },
  };
}

// Negócio não sinalizado só é guardado se combinar com alguma expedição (do parceiro da empresa associada, se houver).
export function matchesSomeExpedition(row: DealRow, exps: Expedition[], partnerIdByAfiliado: Map<string, string>): boolean {
  const pid = row.hs_agency ? partnerIdByAfiliado.get(row.hs_agency) : undefined;
  return exps.some((e) => (!pid || e.partner_id === pid) && !!evalDeal(row, e));
}

export type Skipped = { id: string; reason: string };
export type SyncResult = { ok: boolean; deals: number; skipped: Skipped[]; unsignaled?: number; credits?: string; error?: string };

export async function syncHubspot(admin: SupabaseClient): Promise<SyncResult> {
  const cfg = hubspotConfig();
  if (!cfg) return { ok: false, deals: 0, skipped: [], error: "HUBSPOT_TOKEN não configurado." };

  const { data: run } = await admin.from("sync_runs").insert({}).select("id").single();
  const finish = async (r: SyncResult) => {
    if (run)
      await admin
        .from("sync_runs")
        .update({ finished_at: new Date().toISOString(), ok: r.ok, deals: r.deals, error: r.error ?? null })
        .eq("id", run.id);
    return r;
  };

  try {
    const [{ data: partners, error: pErr0 }, { data: expRows, error: eErr0 }] = await Promise.all([
      admin.from("partners").select("id, afiliado"),
      admin.from("expeditions").select("*"),
    ]);
    if (pErr0 || eErr0) throw new Error(`parceiros/expedições: ${(pErr0 ?? eErr0)!.message}`);
    const afiliados = (partners ?? []).map((p) => String(p.afiliado));
    const partnerIdByAfiliado = new Map((partners ?? []).map((p) => [String(p.afiliado), String(p.id)]));
    const exps = (expRows ?? []) as Expedition[];

    // 1) sinalizados (origem da agência, qualquer etapa)
    // 2) qualquer negócio ganho ou em aberto com viagem perto das expedições (para achar os não sinalizados)
    const flagged = await searchAgencyDeals(cfg);
    let nearby: HsDeal[] = [];
    if (exps.length) {
      const starts = exps.map((e) => e.start_date).sort();
      const ends = exps.map((e) => expEnd(e)).sort();
      nearby = await searchActiveDealsInWindow(cfg, isoOf(dayNum(starts[0]) - 30), isoOf(dayNum(ends[ends.length - 1]) + DEFAULT_TOL.after));
    }
    const fromFlagged = new Set(flagged.map((d) => d.id));
    const hs = [...flagged, ...nearby.filter((d) => !fromFlagged.has(d.id))];

    const assocs = await dealContacts(cfg, hs.map((d) => d.id));
    const contacts = await readContacts(cfg, [...assocs.values()].flat().map((a) => a.contactId));
    const companies = await dealCompanies(cfg, hs.map((d) => d.id));
    const skipped: Skipped[] = [];
    const keptUnsignaled: string[] = [];
    const keptSignaled: string[] = [];
    let n = 0;

    for (const h of hs) {
      const names = companies.get(h.id) ?? [];
      const partner = matchPartner(names, afiliados);
      const signaled = isAgencyOrigem(cfg, h.properties[cfg.origemProp]) && !!partner;
      const mapped = signaled
        ? mapDeal(h, partner, { cfg })
        : mapDeal(h, null, { signaled: false, hsAgency: partner ?? "", cfg });
      if ("skip" in mapped) {
        if (fromFlagged.has(h.id)) skipped.push({ id: h.id, reason: mapped.skip });
        continue;
      }
      if (!signaled) {
        // Negócio perdido e não sinalizado não interessa
        if (mapped.row.stage_kind === "lost") continue;
        if (!matchesSomeExpedition(mapped.row, exps, partnerIdByAfiliado)) {
          if (fromFlagged.has(h.id))
            skipped.push({ id: h.id, reason: names.length ? `empresa "${names.join(", ")}" não é parceiro cadastrado` : "sem empresa (agência) associada" });
          continue;
        }
        keptUnsignaled.push(h.id);
      } else keptSignaled.push(h.id);
      // Expedição do negócio da agência (para as "Pendências de lançamento" do parceiro, SPEC 2.2)
      const pid = signaled ? partnerIdByAfiliado.get(partner!) : undefined;
      const matched = pid ? matchExpedition(mapped.row, exps.filter((e) => e.partner_id === pid)) : null;
      const row = { ...mapped.row, matched_expedition_id: matched?.id ?? null };
      const list = assocs.get(h.id) ?? [];
      const { data: existing } = await admin.from("deals").select("id").eq("hubspot_id", h.id).maybeSingle();
      let firstSeen = new Map<string, string>();
      if (existing) {
        const { data: prev } = await admin
          .from("deal_passengers")
          .select("hubspot_contact_id, first_seen_at")
          .eq("deal_id", existing.id);
        firstSeen = new Map((prev ?? []).filter((p) => p.hubspot_contact_id).map((p) => [p.hubspot_contact_id!, p.first_seen_at]));
      }
      const plan = planPassengers(list, contacts, firstSeen, { titular: cfg.titularLabels, buyer: cfg.buyerLabel, passenger: cfg.passengerLabel }, new Date().toISOString());

      // Só os campos espelhados: override/conferência da Vay não são tocados.
      const { data: deal, error } = await admin
        .from("deals")
        .upsert({ ...row, titular_labeled: plan.labeled, updated_at: new Date().toISOString() }, { onConflict: "hubspot_id" })
        .select("id")
        .single();
      if (error || !deal) throw new Error(`negócio ${h.id}: ${error?.message}`);

      // Passageiros: remove associações desfeitas, limpa o titular e grava o estado atual.
      const keep = plan.rows.map((r) => r.hubspot_contact_id);
      let del = admin.from("deal_passengers").delete().eq("deal_id", deal.id);
      if (keep.length) del = del.not("hubspot_contact_id", "in", `(${keep.join(",")})`);
      const { error: dErr } = await del;
      if (dErr) throw new Error(`passageiros ${h.id}: ${dErr.message}`);
      await admin.from("deal_passengers").update({ is_titular: false }).eq("deal_id", deal.id);
      if (plan.rows.length) {
        const { error: pErr } = await admin
          .from("deal_passengers")
          .upsert(plan.rows.map((r) => ({ ...r, deal_id: deal.id })), { onConflict: "deal_id,hubspot_contact_id" });
        if (pErr) throw new Error(`passageiros ${h.id}: ${pErr.message}`);
      }
      n++;
    }
    // Negócios da agência que saíram do funil ou deixaram de ser da agência saem do sistema.
    // (Os créditos de expedição finalizada já estão congelados no extrato.)
    let gone = admin.from("deals").delete().eq("signaled", true).not("hubspot_id", "is", null);
    if (keptSignaled.length) gone = gone.not("hubspot_id", "in", `(${keptSignaled.join(",")})`);
    const { error: gErr } = await gone;
    if (gErr) throw new Error(`limpeza: ${gErr.message}`);

    // Não sinalizados que deixaram de combinar (ou foram corrigidos) saem da lista.
    let cleanup = admin.from("deals").delete().eq("signaled", false).not("hubspot_id", "is", null);
    if (keptUnsignaled.length) cleanup = cleanup.not("hubspot_id", "in", `(${keptUnsignaled.join(",")})`);
    const { error: cErr } = await cleanup;
    if (cErr) throw new Error(`limpeza: ${cErr.message}`);
    // Créditos (saldo e extrato) de cada agência. Falha aqui não desfaz os negócios: só avisa.
    let credits: string;
    try {
      credits = await syncCredits(admin, cfg, (partners ?? []) as { id: string; afiliado: string }[]);
    } catch (e) {
      credits = `créditos não atualizados: ${e instanceof Error ? e.message : String(e)}`;
    }
    return finish({ ok: true, deals: n, skipped, unsignaled: keptUnsignaled.length, credits });
  } catch (e) {
    return finish({ ok: false, deals: 0, skipped: [], error: e instanceof Error ? e.message : String(e) });
  }
}

// Saldo ("Créditos abertos" da empresa) e extrato (objeto Créditos) de cada agência, espelhados do HubSpot.
// Registro apagado ou desassociado no HubSpot some do extrato.
async function syncCredits(admin: SupabaseClient, cfg: HubspotConfig, partners: { id: string; afiliado: string }[]): Promise<string> {
  const companies = await partnerCompanies(cfg, partners.map((p) => String(p.afiliado)));
  const found = partners.filter((p) => companies.has(String(p.afiliado)));
  const credits = await companyCredits(cfg, found.map((p) => companies.get(String(p.afiliado))!.id));
  const now = new Date().toISOString();
  let lines = 0;
  for (const p of found) {
    const c = companies.get(String(p.afiliado))!;
    const list = credits.get(c.id) ?? [];
    lines += list.length;
    if (list.length) {
      const { error } = await admin
        .from("credit_entries")
        .upsert(list.map((x) => ({ ...x, partner_id: p.id, synced_at: now })), { onConflict: "hubspot_id" });
      if (error) throw new Error(`créditos de ${p.afiliado}: ${error.message}`);
    }
    let del = admin.from("credit_entries").delete().eq("partner_id", p.id);
    if (list.length) del = del.not("hubspot_id", "in", `(${list.map((x) => x.hubspot_id).join(",")})`);
    const { error: dErr } = await del;
    if (dErr) throw new Error(`créditos de ${p.afiliado}: ${dErr.message}`);
    const { error: pErr } = await admin
      .from("partners")
      .update({ hubspot_company_id: c.id, credit_balance: c.balance, credit_synced_at: now })
      .eq("id", p.id);
    if (pErr) throw new Error(`saldo de ${p.afiliado}: ${pErr.message}`);
  }
  const missing = partners.length - found.length;
  return `${lines} lançamentos de crédito` + (missing ? ` · ${missing} parceiro(s) sem empresa com o mesmo nome no HubSpot` : "");
}
