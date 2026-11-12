// Sincronização HubSpot → Supabase (idempotente). Roda com a chave service_role, só no servidor.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dealCompanies,
  dealContacts,
  matchPartner,
  searchWonDealsInWindow,
  hubspotConfig,
  pickTitular,
  readContacts,
  readTrip,
  searchWonDeals,
  toIsoDate,
  type Association,
  type HsContact,
  type HsDeal,
} from "./hubspot";
import { expEnd } from "./commission";
import { dayNum, isoOf } from "./format";
import { DEFAULT_TOL, evalDeal } from "./matching";
import type { Expedition, Leg } from "./types";

export type PassengerRow = {
  hubspot_contact_id: string;
  name: string;
  email: string;
  phone: string;
  is_titular: boolean;
  first_seen_at: string;
  position: number;
};

// Monta os passageiros de um negócio a partir das associações (pura, testada).
export function planPassengers(
  assocs: Association[],
  contacts: Map<string, HsContact>,
  firstSeen: Map<string, string>,
  titularLabel: string,
  now: string,
): { rows: PassengerRow[]; labeled: boolean } {
  const { titularId, labeled } = pickTitular(assocs, titularLabel, firstSeen);
  const rows = assocs.map((a) => {
    const c = contacts.get(a.contactId);
    return {
      hubspot_contact_id: a.contactId,
      name: c?.name ?? "Contato sem nome",
      email: c?.email ?? "",
      phone: c?.phone ?? "",
      is_titular: a.contactId === titularId,
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
  afiliado: string;
  closed_on: string;
  legs: Leg[];
  end_date: string;
  voo: number;
  hotel: number;
  seguro: number;
};

// Sinalizado: afiliado = agência associada (parceiro). Não sinalizado: afiliado vazio (só a Vay vê),
// hsAgency = parceiro pela empresa associada, se houver.
export function mapDeal(
  d: HsDeal,
  afiliado: string | null,
  opts: { signaled?: boolean; hsAgency?: string; origemProp?: string } = {},
): { row: DealRow } | { skip: string } {
  const p = d.properties;
  const signaled = opts.signaled ?? true;
  if (signaled && !afiliado) return { skip: "sem empresa (agência) associada" };
  const closed = toIsoDate(p.closedate);
  if (!closed) return { skip: "sem data de fechamento" };
  const trip = readTrip(p);
  if ("skip" in trip) return { skip: trip.skip };
  return {
    row: {
      hubspot_id: d.id,
      name: String(p.dealname ?? "").trim(),
      signaled,
      hs_origem: String(p[opts.origemProp ?? "origem_do_negocio"] ?? "").trim(),
      hs_agency: opts.hsAgency ?? (signaled ? afiliado ?? "" : ""),
      afiliado: signaled ? afiliado! : "",
      closed_on: closed,
      legs: trip.legs,
      end_date: trip.end,
      voo: trip.product === "voo" ? trip.value : 0,
      hotel: trip.product === "hotel" ? trip.value : 0,
      seguro: trip.product === "seguro" ? trip.value : 0,
    },
  };
}

// Negócio não sinalizado só é guardado se combinar com alguma expedição (do parceiro da empresa associada, se houver).
export function matchesSomeExpedition(row: DealRow, exps: Expedition[], partnerIdByAfiliado: Map<string, string>): boolean {
  const pid = row.hs_agency ? partnerIdByAfiliado.get(row.hs_agency) : undefined;
  return exps.some((e) => (!pid || e.partner_id === pid) && !!evalDeal(row, e));
}

export type Skipped = { id: string; reason: string };
export type SyncResult = { ok: boolean; deals: number; skipped: Skipped[]; unsignaled?: number; error?: string };

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

    // 1) sinalizados (origem Afiliado)  2) qualquer negócio ganho com viagem perto das expedições
    const flagged = await searchWonDeals(cfg);
    let nearby: HsDeal[] = [];
    if (exps.length) {
      const starts = exps.map((e) => e.start_date).sort();
      const ends = exps.map((e) => expEnd(e)).sort();
      nearby = await searchWonDealsInWindow(cfg, isoOf(dayNum(starts[0]) - 30), isoOf(dayNum(ends[ends.length - 1]) + DEFAULT_TOL.after));
    }
    const fromFlagged = new Set(flagged.map((d) => d.id));
    const hs = [...flagged, ...nearby.filter((d) => !fromFlagged.has(d.id))];

    const assocs = await dealContacts(cfg, hs.map((d) => d.id));
    const contacts = await readContacts(cfg, [...assocs.values()].flat().map((a) => a.contactId));
    const companies = await dealCompanies(cfg, hs.map((d) => d.id));
    const skipped: Skipped[] = [];
    const keptUnsignaled: string[] = [];
    let n = 0;

    for (const h of hs) {
      const names = companies.get(h.id) ?? [];
      const partner = matchPartner(names, afiliados);
      const isAfiliado = String(h.properties[cfg.origemProp] ?? "").trim() === cfg.origemValue;
      const signaled = isAfiliado && !!partner;
      const mapped = signaled
        ? mapDeal(h, partner, { origemProp: cfg.origemProp })
        : mapDeal(h, null, { signaled: false, hsAgency: partner ?? "", origemProp: cfg.origemProp });
      if ("skip" in mapped) {
        if (fromFlagged.has(h.id)) skipped.push({ id: h.id, reason: mapped.skip });
        continue;
      }
      if (!signaled) {
        if (!matchesSomeExpedition(mapped.row, exps, partnerIdByAfiliado)) {
          if (fromFlagged.has(h.id))
            skipped.push({ id: h.id, reason: names.length ? `empresa "${names.join(", ")}" não é parceiro cadastrado` : "sem empresa (agência) associada" });
          continue;
        }
        keptUnsignaled.push(h.id);
      }
      const row = mapped.row;
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
      const plan = planPassengers(list, contacts, firstSeen, cfg.titularLabel, new Date().toISOString());

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
    // Não sinalizados que deixaram de combinar (ou foram corrigidos) saem da lista.
    let cleanup = admin.from("deals").delete().eq("signaled", false).not("hubspot_id", "is", null);
    if (keptUnsignaled.length) cleanup = cleanup.not("hubspot_id", "in", `(${keptUnsignaled.join(",")})`);
    const { error: cErr } = await cleanup;
    if (cErr) throw new Error(`limpeza: ${cErr.message}`);
    return finish({ ok: true, deals: n, skipped, unsignaled: keptUnsignaled.length });
  } catch (e) {
    return finish({ ok: false, deals: 0, skipped: [], error: e instanceof Error ? e.message : String(e) });
  }
}
