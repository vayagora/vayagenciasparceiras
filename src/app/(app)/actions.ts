"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cityOf } from "@/lib/cities";
import { STAGES } from "@/lib/commission";
import { parseRows, type ClientRow } from "@/lib/csv";
import { requireSession, requireVay } from "@/lib/data";
import { digits, lower, plural, todayIso } from "@/lib/format";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { syncHubspot } from "@/lib/sync";
import type { Leg } from "@/lib/types";

export type FormState = { error?: string; ok?: string } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const isEmail = (s: string) => /^\S+@\S+\.\S+$/.test(s);
const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// ---------------------------------------------------------------- Expedições

export async function createExpedition(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession();
  const name = str(f, "name");
  const city = str(f, "city");
  const start = str(f, "start_date");
  const days = Number(str(f, "days"));
  const partnerId = s.isVay ? str(f, "partner_id") : s.partner?.id;

  if (!name || !city || !isIsoDate(start) || !(days > 0) || !partnerId)
    return { error: "Preencha nome, destino, data de início e duração." };
  if (!cityOf(city)) return { error: "Escolha um destino da lista." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expeditions")
    .insert({ partner_id: partnerId, name, city, start_date: start, days, created_by: s.profile.id })
    .select("id")
    .single();
  if (error || !data) return { error: "Não foi possível criar a expedição." };

  revalidatePath("/", "layout");
  redirect(`/expedicoes/${data.id}?novo=1`);
}

// ---------------------------------------------------------------- Clientes

async function insertClients(expId: string, rows: ClientRow[]) {
  const s = await requireSession();
  const supabase = await createClient();
  const { data: existing, error } = await supabase
    .from("clients")
    .select("email, phone")
    .eq("expedition_id", expId);
  if (error) throw new Error(error.message);

  const seen = existing ?? [];
  const fresh: ClientRow[] = [];
  let dup = 0;
  for (const r of rows) {
    const e = lower(r.email);
    const ph = digits(r.phone);
    const isDup = [...seen, ...fresh].some(
      (c) => (e && lower(c.email) === e) || (!e && ph && digits(c.phone) === ph),
    );
    if (isDup) dup++;
    else fresh.push({ name: r.name, email: e, phone: r.phone });
  }
  if (fresh.length) {
    const { error: insErr } = await supabase.from("clients").insert(
      fresh.map((r) => ({ ...r, expedition_id: expId, stage: "novo", created_by: s.profile.id })),
    );
    if (insErr) throw new Error(insErr.message);
  }
  revalidatePath("/", "layout");
  return { added: fresh.length, dup };
}

export async function addClient(expId: string, _: FormState, f: FormData): Promise<FormState> {
  const name = str(f, "name");
  const email = str(f, "email");
  const phone = str(f, "phone");
  if (!name) return { error: "Informe o nome do cliente." };
  if (!isEmail(email)) return { error: "Informe um e-mail válido." };
  try {
    const res = await insertClients(expId, [{ name, email, phone }]);
    if (!res.added) return { error: "Esse cliente já está nesta expedição." };
  } catch {
    return { error: "Não foi possível cadastrar o cliente." };
  }
  return { ok: `${name} foi cadastrado. A Vay Agora fará o primeiro contato.` };
}

export async function importClients(expId: string, _: FormState, f: FormData): Promise<FormState> {
  const rows = parseRows(str(f, "rows"));
  if (!rows.length) return { error: "Nenhum cliente encontrado. Confira as colunas: nome, e-mail, telefone." };
  try {
    const res = await insertClients(expId, rows);
    return {
      ok:
        plural(res.added, "cliente cadastrado", "clientes cadastrados") +
        (res.dup ? ` · ${res.dup} já estava${res.dup === 1 ? "" : "m"} nesta expedição` : "") +
        ".",
    };
  } catch {
    return { error: "Não foi possível importar os clientes." };
  }
}

export async function saveFollowUp(clientId: string, _: FormState, f: FormData): Promise<FormState> {
  await requireVay();
  const stage = str(f, "stage");
  const note = str(f, "note");
  if (!STAGES.some((s) => s.id === stage)) return { error: "Etapa inválida." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({ stage, note, last_follow_up: todayIso() })
    .eq("id", clientId);
  if (error) return { error: "Não foi possível salvar o follow-up." };
  revalidatePath("/", "layout");
  return { ok: "Follow-up salvo. O parceiro já vê a atualização." };
}

// ---------------------------------------------------------------- Negócios

export async function assignDeal(dealId: string, value: string) {
  await requireVay();
  const patch =
    value === "auto"
      ? { override_expedition_id: null, override_none: false }
      : value === "none"
        ? { override_expedition_id: null, override_none: true }
        : { override_expedition_id: value, override_none: false };
  const supabase = await createClient();
  const { error } = await supabase.from("deals").update(patch).eq("id", dealId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function setReviewed(dealId: string, reviewed: boolean) {
  await requireVay();
  const supabase = await createClient();
  const { error } = await supabase.from("deals").update({ reviewed }).eq("id", dealId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// Lançamento manual de um negócio fechado (até a sincronização com o HubSpot entrar).
export async function createDeal(afiliado: string, _: FormState, f: FormData): Promise<FormState> {
  await requireVay();
  const contact_name = str(f, "contact_name");
  const email = lower(str(f, "email"));
  const phone = str(f, "phone");
  const others = parseRows(str(f, "others"));
  const closed_on = str(f, "closed_on");
  const end_date = str(f, "end_date");
  const legs: Leg[] = [0, 1, 2]
    .map((i) => ({ city: str(f, `leg_city_${i}`), date: str(f, `leg_date_${i}`) }))
    .filter((l) => l.city && l.date);
  // Aceita "1.234,56" (padrão BR) e "1234.56"
  const money = (k: string) => {
    const v = str(f, k).replace(/[R$\s]/g, "");
    return Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v) || 0;
  };
  const voo = money("voo");
  const hotel = money("hotel");
  const seguro = money("seguro");

  if (!contact_name) return { error: "Informe o nome do cliente." };
  if (email && !isEmail(email)) return { error: "E-mail inválido." };
  if (others.some((o) => o.email && !isEmail(o.email))) return { error: "Confira o e-mail dos outros passageiros." };
  if (!isIsoDate(closed_on) || !isIsoDate(end_date)) return { error: "Informe as datas de fechamento e de volta." };
  if (!legs.length) return { error: "Informe pelo menos um trecho (cidade e data)." };
  if (legs.some((l) => !cityOf(l.city) || !isIsoDate(l.date))) return { error: "Confira as cidades e datas dos trechos." };
  if (voo + hotel + seguro <= 0) return { error: "Informe o valor de pelo menos um produto." };

  const supabase = await createClient();
  const { data: deal, error } = await supabase
    .from("deals")
    .insert({ afiliado, closed_on, end_date, legs, voo, hotel, seguro })
    .select("id")
    .single();
  if (error || !deal) return { error: "Não foi possível registrar o negócio." };
  const passengers = [
    { name: contact_name, email, phone, is_titular: true },
    ...others.map((o) => ({ name: o.name, email: lower(o.email), phone: o.phone, is_titular: false })),
  ].map((p, position) => ({ ...p, deal_id: deal.id, position }));
  const { error: pErr } = await supabase.from("deal_passengers").insert(passengers);
  if (pErr) {
    await supabase.from("deals").delete().eq("id", deal.id);
    return { error: "Não foi possível registrar os passageiros do negócio." };
  }
  revalidatePath("/", "layout");
  return { ok: "Negócio registrado e vinculado pelas regras de afiliado, data e destino." };
}

// Sincronização sob demanda (a agendada usa /api/cron/sync).
export async function syncNow(): Promise<FormState> {
  await requireVay();
  const r = await syncHubspot(createAdminClient());
  revalidatePath("/", "layout");
  if (!r.ok) return { error: `Falha na sincronização: ${r.error}` };
  return {
    ok:
      plural(r.deals, "negócio sincronizado", "negócios sincronizados") +
      (r.skipped.length ? ` · ${r.skipped.length} sem roteiro, data de volta ou fechamento (${r.skipped.join(", ")})` : "") +
      ".",
  };
}

// ---------------------------------------------------------------- Parceiros

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

type Access = { role: "vay" | "parceiro"; partner_id: string | null; full_name?: string };

async function inviteUser(email: string, access: Access) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: access.full_name ? { full_name: access.full_name } : undefined,
    redirectTo: `${await siteUrl()}/auth/confirm?next=/definir-senha`,
  });
  if (error || !data.user) return error ?? new Error("Convite não criado.");
  // O papel é gravado pelo servidor, nunca a partir de metadados do usuário.
  const { error: pErr } = await admin
    .from("profiles")
    .update({ role: access.role, partner_id: access.partner_id })
    .eq("id", data.user.id);
  return pErr ? new Error(pErr.message) : null;
}

export async function createPartner(_: FormState, f: FormData): Promise<FormState> {
  await requireVay();
  const name = str(f, "name");
  const afiliado = str(f, "afiliado") || name;
  const email = lower(str(f, "email"));
  if (!name) return { error: "Informe o nome da agência." };
  if (email && !isEmail(email)) return { error: "E-mail inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partners")
    .insert({ name, afiliado, contact_email: email || null })
    .select("id")
    .single();
  if (error || !data)
    return { error: error?.code === "23505" ? "Já existe um parceiro com esse afiliado." : "Não foi possível cadastrar o parceiro." };

  revalidatePath("/", "layout");
  if (email) {
    const inv = await inviteUser(email, { role: "parceiro", partner_id: data.id, full_name: name });
    if (inv) return { ok: `${name} cadastrado, mas o convite falhou: ${inv.message}` };
    return { ok: `${name} cadastrado. Enviamos o convite de acesso para ${email}.` };
  }
  return { ok: `${name} cadastrado.` };
}

export async function invitePartnerUser(partnerId: string, _: FormState, f: FormData): Promise<FormState> {
  await requireVay();
  const email = lower(str(f, "email"));
  if (!isEmail(email)) return { error: "Informe um e-mail válido." };
  const inv = await inviteUser(email, { role: "parceiro", partner_id: partnerId });
  if (inv) return { error: `Não foi possível convidar: ${inv.message}` };
  return { ok: `Convite enviado para ${email}.` };
}

export async function inviteVayUser(_: FormState, f: FormData): Promise<FormState> {
  await requireVay();
  const email = lower(str(f, "email"));
  const name = str(f, "name");
  if (!isEmail(email)) return { error: "Informe um e-mail válido." };
  const inv = await inviteUser(email, { role: "vay", partner_id: null, full_name: name });
  if (inv) return { error: `Não foi possível convidar: ${inv.message}` };
  return { ok: `Convite enviado para ${email}.` };
}
