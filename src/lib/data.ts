import { cache } from "react";
import { redirect } from "next/navigation";
import { Ledger } from "./ledger";
import { createClient } from "./supabase/server";
import type { Client, Deal, Expedition, Partner, Passenger, Profile } from "./types";

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
  if (!s.isVay) redirect("/painel");
  return s;
}

export type World = {
  partners: Partner[];
  exps: Expedition[];
  clients: Client[];
  deals: Deal[];
  ledger: Ledger;
};

// Carrega tudo o que o usuário pode ver (as regras de acesso do banco já filtram por parceiro).
export const loadWorld = cache(async (): Promise<World> => {
  const supabase = await createClient();
  // deal_passengers: o parceiro só recebe os passageiros que ele cadastrou (RLS).
  const [partners, exps, clients, deals, passengers] = await Promise.all([
    supabase.from("partners").select("*").order("name"),
    supabase.from("expeditions").select("*").order("start_date"),
    supabase.from("clients").select("*").order("created_at"),
    supabase.from("deals").select("*").order("closed_on", { ascending: false }),
    supabase.from("deal_passengers").select("*").order("position"),
  ]);
  for (const r of [partners, exps, clients, deals, passengers]) {
    if (r.error) throw new Error(r.error.message);
  }
  const byDeal = new Map<string, Passenger[]>();
  for (const p of (passengers.data ?? []) as Passenger[]) {
    byDeal.set(p.deal_id, [...(byDeal.get(p.deal_id) ?? []), p]);
  }
  const w = {
    partners: (partners.data ?? []) as Partner[],
    exps: (exps.data ?? []) as Expedition[],
    clients: (clients.data ?? []) as Client[],
    deals: ((deals.data ?? []) as Deal[]).map((d) => ({
      ...d,
      voo: Number(d.voo),
      hotel: Number(d.hotel),
      seguro: Number(d.seguro),
      passengers: byDeal.get(d.id) ?? [],
    })),
  };
  return { ...w, ledger: new Ledger(w.deals, w.partners, w.exps, w.clients) };
});
