"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AIRPORTS } from "@/lib/airports";
import { loadWorld, requireVay } from "@/lib/data";
import { dayNum, lower, plural, todayIso } from "@/lib/format";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { syncHubspot } from "@/lib/sync";

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

  revalidatePath("/", "layout");
  redirect(`/expedicoes/${data.id}`);
}

// ---------------------------------------------------------------- Fechamento da expedição

// A Vay confirma que a expedição aconteceu: os créditos (ganho dos negócios ganhos vinculados, calculado agora)
// são lançados uma única vez no extrato do parceiro. Depois disso o valor não muda (período fechado).
export async function finishExpedition(expId: string): Promise<FormState> {
  const s = await requireVay();
  const supabase = await createClient();
  const { exps, ledger } = await loadWorld();
  const exp = exps.find((e) => e.id === expId);
  if (!exp) return { error: "Expedição não encontrada." };
  if (exp.finished_at) return { error: "Esta expedição já foi finalizada." };
  if (dayNum(exp.start_date) + Number(exp.days) - 1 >= dayNum(todayIso()))
    return { error: "Só é possível finalizar depois da data de fim da expedição." };

  const deals = ledger.dealsForExp(exp.id);
  const total = Math.round(ledger.earnings(exp.id).total * 100) / 100;
  const who = s.profile.full_name || s.profile.email;
  const now = new Date().toISOString();

  // Marca primeiro (só a primeira tentativa passa: finished_at ainda vazio)
  const { data: marked, error: mErr } = await supabase
    .from("expeditions")
    .update({ finished_at: now, finished_by: s.profile.id, finished_by_name: who })
    .eq("id", exp.id)
    .is("finished_at", null)
    .select("id");
  if (mErr) return { error: "Não foi possível finalizar a expedição." };
  if (!marked?.length) return { error: "Esta expedição já foi finalizada." };

  if (total > 0) {
    const { error } = await supabase.from("balance_entries").insert({
      partner_id: exp.partner_id,
      expedition_id: exp.id,
      kind: "in",
      amount: total,
      entry_date: todayIso(),
      title: `Créditos da expedição ${exp.name}`,
      note: plural(deals.length, "negócio", "negócios"),
      created_by: s.profile.id,
      created_by_name: who,
    });
    if (error) {
      // Desfaz a marcação para poder tentar de novo
      await supabase.from("expeditions").update({ finished_at: null, finished_by: null, finished_by_name: "" }).eq("id", exp.id);
      return { error: "Não foi possível lançar os créditos no extrato." };
    }
  }
  revalidatePath("/", "layout");
  return { ok: total > 0 ? "Expedição finalizada e créditos lançados no extrato." : "Expedição finalizada (sem créditos a lançar)." };
}

// ---------------------------------------------------------------- Conferência (SPEC 2.1)

// A Vay só alterna entre "A conferir" e "Conferido". "Passageiros" é preenchido apenas pela sincronização.
export async function setPersonReviewed(expId: string, personKey: string, personName: string, reviewed: boolean): Promise<FormState> {
  const s = await requireVay();
  if (!/^(c|n|d):.+/.test(personKey)) return { error: "Passageiro inválido." };
  const supabase = await createClient();
  const { error } = reviewed
    ? await supabase.from("expedition_reviews").upsert(
        {
          expedition_id: expId,
          person_key: personKey,
          person_name: personName.slice(0, 200),
          reviewed_by: s.profile.id,
          reviewed_by_name: s.profile.full_name || s.profile.email,
          reviewed_at: new Date().toISOString(),
        },
        { onConflict: "expedition_id,person_key" },
      )
    : await supabase.from("expedition_reviews").delete().eq("expedition_id", expId).eq("person_key", personKey);
  if (error) return { error: "Não foi possível salvar a conferência." };
  revalidatePath("/", "layout");
  return { ok: reviewed ? "Marcado como conferido." : "Voltou para a conferir." };
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
      (r.unsignaled ? ` · ${plural(r.unsignaled, "encontrado sem sinalização no HubSpot", "encontrados sem sinalização no HubSpot")}` : "") +
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
