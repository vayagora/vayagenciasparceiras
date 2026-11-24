"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AIRPORTS } from "@/lib/airports";
import { loadWorld, requireVay } from "@/lib/data";
import { personKey } from "@/lib/ledger";
import { dealNo } from "@/lib/matching";
import { brl, dayNum, lower, plural } from "@/lib/format";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { syncHubspot } from "@/lib/sync";
import { refreshPending } from "@/lib/pending";

export type FormState = { error?: string; ok?: string } | undefined;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const isEmail = (s: string) => /^\S+@\S+\.\S+$/.test(s);
const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// ---------------------------------------------------------------- Expedições

// "BKK – Bangkok" ou "BKK" → "BKK" (só códigos da tabela de aeroportos).
function airportCode(v: string): string | null {
  const code = v.trim().toUpperCase().match(/^([A-Z0-9]{3})\b/)?.[1];
  return code && AIRPORTS[code] ? code : null;
}

export async function createExpedition(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireVay();
  const name = str(f, "name");
  const city = str(f, "city");
  const start = str(f, "start_date");
  const end = str(f, "end_date");
  const arrivalRaw = str(f, "arrival_airport");
  const departureRaw = str(f, "departure_airport");
  const partnerId = str(f, "partner_id");

  if (!name || !city || !isIsoDate(start) || !isIsoDate(end) || !arrivalRaw || !partnerId)
    return { error: "Preencha nome, destino, datas de início e fim e o aeroporto de chegada." };
  const days = dayNum(end) - dayNum(start) + 1;
  if (days < 1) return { error: "A data de fim precisa ser igual ou depois da data de início." };
  const arrival = airportCode(arrivalRaw);
  if (!arrival) return { error: "Escolha o aeroporto de chegada na lista (ex.: BKK · Bangkok)." };
  const departure = departureRaw ? airportCode(departureRaw) : null;
  if (departureRaw && !departure) return { error: "Escolha o aeroporto de saída na lista (ex.: GRU · São Paulo)." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("expeditions")
    .insert({
      partner_id: partnerId,
      name,
      city,
      start_date: start,
      days,
      arrival_airport: arrival,
      departure_airport: departure,
      created_by: s.profile.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Não foi possível criar a expedição." };

  await refreshPending(createAdminClient()).catch(() => undefined);
  revalidatePath("/", "layout");
  redirect(`/expedicoes/${data.id}`);
}

// ---------------------------------------------------------------- Conclusão da expedição (SPEC 2.4)

// A Vay conclui a expedição: o ganho (negócios ganhos da lista, calculado agora) fica registrado como valor apurado,
// congelado. O crédito é lançado pela equipe no HubSpot (objeto Créditos da empresa) e aparece no extrato na
// sincronização (SPEC 2.3). Bloqueada enquanto houver negócio da agência em "A conferir" (ficaria fora da apuração).
export async function finishExpedition(expId: string): Promise<FormState> {
  const s = await requireVay();
  const supabase = await createClient();
  const { exps, ledger } = await loadWorld();
  const exp = exps.find((e) => e.id === expId);
  if (!exp) return { error: "Expedição não encontrada." };
  if (exp.finished_at) return { error: "Esta expedição já foi concluída." };
  const blocked = ledger.pendingAgencyDeals(exp.id);
  if (blocked.length)
    return { error: `Ainda há ${plural(blocked.length, "negócio da agência", "negócios da agência")} em “A conferir”: ${blocked.map((r) => dealNo(r.deal)).join(", ")}.` };

  const deals = ledger.dealsForExp(exp.id);
  const total = Math.round(ledger.earnings(exp.id).total * 100) / 100;
  const who = s.profile.full_name || s.profile.email;

  const { data: marked, error: mErr } = await supabase
    .from("expeditions")
    .update({ finished_at: new Date().toISOString(), finished_by: s.profile.id, finished_by_name: who, finished_amount: total })
    .eq("id", exp.id)
    .is("finished_at", null)
    .select("id");
  if (mErr) return { error: "Não foi possível concluir a expedição." };
  if (!marked?.length) return { error: "Esta expedição já foi concluída." };
  revalidatePath("/", "layout");
  return {
    ok:
      total > 0
        ? `Expedição concluída: ${brl(total)} apurados (${plural(deals.length, "negócio", "negócios")}). Lance esse crédito no HubSpot, no objeto Créditos da empresa.`
        : "Expedição concluída (sem créditos a lançar).",
  };
}

// Reabre a expedição: descarta o valor apurado. Se o crédito já foi lançado no HubSpot, a equipe ajusta lá.
export async function reopenExpedition(expId: string): Promise<FormState> {
  await requireVay();
  const supabase = await createClient();
  const { error } = await supabase
    .from("expeditions")
    .update({ finished_at: null, finished_by: null, finished_by_name: "", finished_amount: null })
    .eq("id", expId);
  if (error) return { error: "Não foi possível reabrir a expedição." };
  revalidatePath("/", "layout");
  return { ok: "Expedição reaberta." };
}

// ---------------------------------------------------------------- Conferência (SPEC 2.4)

// Depois de cada marcação, atualiza as pendências que o parceiro vê (falha aqui não desfaz a marcação).
async function afterReview(): Promise<void> {
  try {
    await refreshPending(createAdminClient());
  } catch {
    // na próxima sincronização as pendências são recalculadas
  }
  revalidatePath("/", "layout");
}

// Negócio conjunto da agência: "Marcar como passageiros" (o negócio inteiro, com os passageiros de agora).
// Se depois entrar ou sair alguém do negócio no HubSpot, ele volta sozinho para "A conferir".
export async function approveJointDeal(expId: string, dealId: string): Promise<FormState> {
  const s = await requireVay();
  const { ledger } = await loadWorld();
  const r = ledger.agencyDeals(expId).find((x) => x.deal.id === dealId);
  if (!r) return { error: "Negócio não encontrado nesta expedição (ou não sinalizado no HubSpot)." };
  const keys = r.deal.passengers.filter((p) => p.is_passenger !== false).map((p) => personKey(p));
  if (keys.length < 2) return { error: "Este negócio não é conjunto." };
  const supabase = await createClient();
  const { error } = await supabase.from("expedition_approvals").upsert(
    {
      expedition_id: expId,
      deal_id: dealId,
      passenger_keys: keys,
      approved_by: s.profile.id,
      approved_by_name: s.profile.full_name || s.profile.email,
      approved_at: new Date().toISOString(),
    },
    { onConflict: "expedition_id,deal_id" },
  );
  if (error) return { error: "Não foi possível salvar." };
  await afterReview();
  return { ok: "Passageiros do negócio marcados." };
}

// Devolve um negócio conjunto aprovado para "A conferir" (o negócio inteiro).
export async function unapproveJointDeal(expId: string, dealId: string): Promise<FormState> {
  await requireVay();
  const supabase = await createClient();
  const { error } = await supabase.from("expedition_approvals").delete().eq("expedition_id", expId).eq("deal_id", dealId);
  if (error) return { error: "Não foi possível salvar." };
  await afterReview();
  return { ok: "Negócio voltou para a conferência." };
}

// Negócio não sinalizado: a Vay marca o passageiro como conferido (não é da expedição) ou desfaz.
export async function setPersonReviewed(expId: string, key: string, personName: string, reviewed: boolean): Promise<FormState> {
  const s = await requireVay();
  if (!/^(c|n|d):.+/.test(key)) return { error: "Passageiro inválido." };
  const supabase = await createClient();
  const { error } = reviewed
    ? await supabase.from("expedition_reviews").upsert(
        {
          expedition_id: expId,
          person_key: key,
          person_name: personName.slice(0, 200),
          reviewed_by: s.profile.id,
          reviewed_by_name: s.profile.full_name || s.profile.email,
          reviewed_at: new Date().toISOString(),
        },
        { onConflict: "expedition_id,person_key" },
      )
    : await supabase.from("expedition_reviews").delete().eq("expedition_id", expId).eq("person_key", key);
  if (error) return { error: "Não foi possível salvar." };
  await afterReview();
  return { ok: reviewed ? "Marcado como conferido." : "Voltou para a conferir." };
}

// Sincronização sob demanda (a agendada usa /api/cron/sync).
export async function syncNow(): Promise<FormState> {
  await requireVay();
  const admin = createAdminClient();
  const r = await syncHubspot(admin);
  if (r.ok) await refreshPending(admin).catch(() => undefined);
  revalidatePath("/", "layout");
  if (!r.ok) return { error: `Falha na sincronização: ${r.error}` };
  return {
    ok:
      plural(r.deals, "negócio sincronizado", "negócios sincronizados") +
      (r.unsignaled ? ` · ${plural(r.unsignaled, "encontrado sem sinalização no HubSpot", "encontrados sem sinalização no HubSpot")}` : "") +
      (r.credits ? ` · ${r.credits}` : "") +
      (r.skipped.length
        ? ` · ${r.skipped.length} ignorado${r.skipped.length === 1 ? "" : "s"}: ` +
          r.skipped.slice(0, 5).map((x) => `#${x.id} (${x.reason})`).join(", ") +
          (r.skipped.length > 5 ? "…" : "")
        : "") +
      ".",
  };
}

// ---------------------------------------------------------------- Acordo de parceria

// O PDF já foi enviado ao Storage pelo navegador (anexos/acordos/<partner_id>/...).
export async function setPartnerAgreement(partnerId: string, path: string | null, name: string | null): Promise<FormState> {
  await requireVay();
  if (path && !path.startsWith(`acordos/${partnerId}/`)) return { error: "Arquivo inválido." };
  const supabase = await createClient();
  const { data: prev } = await supabase.from("partners").select("agreement_path").eq("id", partnerId).single();
  const { error } = await supabase.from("partners").update({ agreement_path: path, agreement_name: name }).eq("id", partnerId);
  if (error) return { error: "Não foi possível salvar o acordo." };
  if (prev?.agreement_path && prev.agreement_path !== path) await supabase.storage.from("anexos").remove([prev.agreement_path]);
  revalidatePath("/", "layout");
  return { ok: path ? "Acordo atualizado. O parceiro já vê o novo documento." : "Voltou ao acordo padrão." };
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
