import { cache } from "react";
import { redirect } from "next/navigation";
import { Ledger } from "./ledger";
import { createClient } from "./supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreditEntry, Deal, Expedition, ExpeditionApproval, ExpeditionPending, ExpeditionReview, Partner, Passenger, Profile } from "./types";

export type Session = {
  profile: Profile;
  partner: Partner | null;
  isVay: boolean;
};

export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, partner_id")
    .eq("id", user.id)
    .single<Profile>();
  if (!profile) return null;

  let partner: Partner | null = null;
  if (profile.role === "parceiro" && profile.partner_id) {
    const { data } = await supabase
      .from("partners")
      .select("*")
      .eq("id", profile.partner_id)
      .single<Partner>();
    partner = data;
  }
  return { profile, partner, isVay: profile.role === "vay" };
});

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireVay(): Promise<Session> {
  const s = await requireSession();
  if (!s.isVay) redirect("/expedicoes");
  return s;
}

export type World = {
  partners: Partner[];
  exps: Expedition[];
  deals: Deal[];
  credits: CreditEntry[];
  reviews: ExpeditionReview[];
  approvals: ExpeditionApproval[];
  ledger: Ledger;
};

// Carrega tudo o que o usuário pode ver (as regras de acesso do banco já filtram por parceiro).
export const loadWorld = cache(async (): Promise<World> => {
  const s = await getSession();
  return buildWorld(await createClient(), !!s?.isVay);
});

// fullView = Vay (ou o sistema, com a chave de serviço): calcula as pendências a partir de tudo.
// Parceiro: usa as pendências gravadas pelo sistema (ele não enxerga os negócios não sinalizados).
export async function buildWorld(supabase: SupabaseClient, fullView: boolean): Promise<World> {
  const [partners, exps, deals, passengers, credits, reviews, approvals, pending] = await Promise.all([
    supabase.from("partners").select("*").order("name"),
    supabase.from("expeditions").select("*").order("start_date"),
    supabase.from("deals").select("*").order("closed_on", { ascending: false, nullsFirst: false }),
    // O parceiro recebe os passageiros dos negócios da própria agência (RLS).
    supabase.from("deal_passengers").select("*").order("position"),
    // Extrato de créditos (HubSpot): o parceiro recebe só os próprios (RLS)
    supabase.from("credit_entries").select("*").order("created_on", { ascending: false }),
    // Conferência: só a Vay recebe linhas (RLS); para o parceiro vem vazio
    supabase.from("expedition_reviews").select("*"),
    // Negócios conjuntos aprovados e pendências calculadas (o parceiro lê os das próprias expedições)
    supabase.from("expedition_approvals").select("*"),
    supabase.from("expedition_pending").select("*"),
  ]);
  for (const r of [partners, exps, deals, passengers, credits, reviews, approvals, pending]) {
    if (r.error) throw new Error(r.error.message);
  }
  const byDeal = new Map<string, Passenger[]>();
  for (const p of (passengers.data ?? []) as Passenger[]) {
    byDeal.set(p.deal_id, [...(byDeal.get(p.deal_id) ?? []), p]);
  }
  const w = {
    partners: ((partners.data ?? []) as Partner[]).map((p) => ({ ...p, credit_balance: p.credit_balance === null || p.credit_balance === undefined ? null : Number(p.credit_balance) })),
    exps: ((exps.data ?? []) as Expedition[]).map((e) => ({ ...e, finished_amount: e.finished_amount === null || e.finished_amount === undefined ? null : Number(e.finished_amount) })),
    deals: ((deals.data ?? []) as Deal[]).map((d) => ({
      ...d,
      voo: Number(d.voo),
      hotel: Number(d.hotel),
      seguro: Number(d.seguro),
      passengers: byDeal.get(d.id) ?? [],
      details: d.details ?? {},
      payment_methods: d.payment_methods ?? [],
      partner_note: d.partner_note ?? "",
      stage_kind: d.stage_kind ?? "won",
      hs_stage: d.hs_stage ?? "",
      cashback_override: d.cashback_override === null || d.cashback_override === undefined ? null : Number(d.cashback_override),
    })),
    credits: ((credits.data ?? []) as CreditEntry[]).map((c) => ({ ...c, amount: Number(c.amount) })),
    reviews: (reviews.data ?? []) as ExpeditionReview[],
    approvals: (approvals.data ?? []) as ExpeditionApproval[],
  };
  const ledger = new Ledger(w.deals, w.partners, w.exps, {
    reviews: w.reviews,
    approvals: w.approvals,
    storedPending: fullView ? null : ((pending.data ?? []) as ExpeditionPending[]),
  });
  return { ...w, ledger };
}
