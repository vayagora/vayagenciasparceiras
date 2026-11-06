// Sincronização HubSpot → Supabase (idempotente). Roda com a chave service_role, só no servidor.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dealContacts,
  hubspotConfig,
  pickTitular,
  readContacts,
  readTrip,
  searchWonDeals,
  toIsoDate,
  type Association,
  type HsContact,
  type HsDeal,
  type HubspotConfig,
} from "./hubspot";
import type { Leg } from "./types";

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
  afiliado: string;
  closed_on: string;
  legs: Leg[];
  end_date: string;
  voo: number;
  hotel: number;
  seguro: number;
};

export function mapDeal(d: HsDeal, cfg: HubspotConfig): { row: DealRow } | { skip: string } {
  const p = d.properties;
  const afiliado = String(p[cfg.afiliadoProp] ?? "").trim();
  if (!afiliado) return { skip: "sem agência parceira" };
  const closed = toIsoDate(p.closedate);
  if (!closed) return { skip: "sem data de fechamento" };
  const trip = readTrip(p);
  if ("skip" in trip) return { skip: trip.skip };
  return {
    row: {
      hubspot_id: d.id,
      afiliado,
      closed_on: closed,
      legs: trip.legs,
      end_date: trip.end,
      voo: trip.product === "voo" ? trip.value : 0,
      hotel: trip.product === "hotel" ? trip.value : 0,
      seguro: trip.product === "seguro" ? trip.value : 0,
    },
  };
}

export type Skipped = { id: string; reason: string };
export type SyncResult = { ok: boolean; deals: number; skipped: Skipped[]; error?: string };

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
    const skipped: Skipped[] = [];
    let n = 0;

    for (const h of hs) {
      const mapped = mapDeal(h, cfg);
      if ("skip" in mapped) {
        skipped.push({ id: h.id, reason: mapped.skip });
        continue;
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
    return finish({ ok: true, deals: n, skipped });
  } catch (e) {
    return finish({ ok: false, deals: 0, skipped: [], error: e instanceof Error ? e.message : String(e) });
  }
}
