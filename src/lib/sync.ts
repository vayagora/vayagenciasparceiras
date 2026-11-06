// Sincronização HubSpot → Supabase (idempotente). Roda com a chave service_role, só no servidor.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dealContacts,
  hubspotConfig,
  money,
  parseRoteiro,
  pickTitular,
  readContacts,
  searchWonDeals,
  toIsoDate,
  type Association,
  type HsContact,
  type HsDeal,
  type HubspotConfig,
} from "./hubspot";

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

export function mapDeal(d: HsDeal, cfg: HubspotConfig) {
  const p = d.properties;
  const legs = parseRoteiro(p[cfg.props.roteiro]);
  const end = toIsoDate(p[cfg.props.dataVolta]) ?? legs.at(-1)?.date ?? null;
  const closed = toIsoDate(p.closedate);
  if (!legs.length || !end || !closed) return null;
  return {
    hubspot_id: d.id,
    afiliado: String(p[cfg.props.afiliado] ?? "").trim(),
    closed_on: closed,
    legs,
    end_date: end,
    voo: money(p[cfg.props.voo]),
    hotel: money(p[cfg.props.hotel]),
    seguro: money(p[cfg.props.seguro]),
  };
}

export type SyncResult = { ok: boolean; deals: number; skipped: string[]; error?: string };

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
    const hs = await searchWonDeals(cfg);
    const assocs = await dealContacts(cfg, hs.map((d) => d.id));
    const contacts = await readContacts(cfg, [...assocs.values()].flat().map((a) => a.contactId));
    const skipped: string[] = [];
    let n = 0;

    for (const h of hs) {
      const row = mapDeal(h, cfg);
      if (!row || !row.afiliado) {
        skipped.push(h.id);
        continue;
      }
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
    return finish({ ok: true, deals: n, skipped });
  } catch (e) {
    return finish({ ok: false, deals: 0, skipped: [], error: e instanceof Error ? e.message : String(e) });
  }
}
