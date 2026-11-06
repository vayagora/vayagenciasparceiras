import { cache } from "react";
import { redirect } from "next/navigation";
import { Ledger } from "./commission";
import { createClient } from "./supabase/server";
import type { Client, Deal, Expedition, Partner, Profile } from "./types";

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
  const [partners, exps, clients, deals] = await Promise.all([
    supabase.from("partners").select("*").order("name"),
    supabase.from("expeditions").select("*").order("start_date"),
    supabase.from("clients").select("*").order("created_at"),
    supabase.from("deals").select("*").order("closed_on", { ascending: false }),
  ]);
  for (const r of [partners, exps, clients, deals]) {
    if (r.error) throw new Error(r.error.message);
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
    })),
  };
  return { ...w, ledger: new Ledger(w.deals, w.partners, w.exps, w.clients) };
});
