"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AIRPORTS } from "@/lib/airports";
import { cityOf } from "@/lib/cities";
import { parseRows, type ClientRow } from "@/lib/csv";
import { requireSession, requireVay } from "@/lib/data";
import { dayNum, digits, lower, plural, todayIso } from "@/lib/format";
import { calculatedCashback } from "@/lib/matching";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { syncHubspot } from "@/lib/sync";
import type { Leg } from "@/lib/types";

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
  const s = await requireSession();
  const name = str(f, "name");
  const city = str(f, "city");
  const start = str(f, "start_date");
  const end = str(f, "end_date");
  const arrivalRaw = str(f, "arrival_airport");
  const departureRaw = str(f, "departure_airport");
  const partnerId = s.isVay ? str(f, "partner_id") : s.partner?.id;

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
      fresh.map((r) => ({ ...r, expedition_id: expId, stage: "auto", created_by: s.profile.id })),
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

// Status do contato que a Vay marca no sistema ("auto" = não contactado).
const CONTACT_STAGES = ["auto", "tentando", "em_contato", "chamar_depois", "nao_contactar", "outro_lugar"];

// Etapa e responsável editados na própria linha da tabela (protótipo v37). Só a Vay.
export async function setClientStage(clientId: string, stage: string): Promise<FormState> {
  await requireVay();
  if (!CONTACT_STAGES.includes(stage)) return { error: "Etapa inválida." };
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ stage, last_follow_up: todayIso() }).eq("id", clientId);
  if (error) return { error: "Não foi possível salvar a etapa." };
  revalidatePath("/", "layout");
  return { ok: "Etapa salva." };
}

export async function setClientOwner(clientId: string, ownerId: string | null): Promise<FormState> {
  await requireVay();
  const supabase = await createClient();
  let ownerName = "";
  if (ownerId) {
    const { data: p } = await supabase.from("profiles").select("full_name, email, role").eq("id", ownerId).single();
    if (!p || p.role !== "vay") return { error: "Responsável inválido." };
    ownerName = p.full_name || p.email;
  }
  const { error } = await supabase.from("clients").update({ owner_id: ownerId, owner_name: ownerName }).eq("id", clientId);
  if (error) return { error: "Não foi possível salvar o responsável." };
  revalidatePath("/", "layout");
  return { ok: "Responsável salvo." };
}

// Vincula um passageiro de um negócio do HubSpot a um cliente da lista (quando contato, e-mail, telefone e nome
// não bateram). Grava no cliente o contato do HubSpot (ou, sem ele, o e-mail/telefone do passageiro) e deixa
// um comentário interno registrando o vínculo.
export async function linkPassengerToClient(passengerId: string, clientId: string): Promise<FormState> {
  const s = await requireVay();
  const supabase = await createClient();
  const [{ data: p }, { data: c }] = await Promise.all([
    supabase.from("deal_passengers").select("name, email, phone, hubspot_contact_id, deal_id").eq("id", passengerId).single(),
    supabase.from("clients").select("id, name, email, phone, expedition_id").eq("id", clientId).single(),
  ]);
  if (!p || !c) return { error: "Passageiro ou cliente não encontrado." };
  const [{ data: d }, { data: e }] = await Promise.all([
    supabase.from("deals").select("hubspot_id, seq, afiliado").eq("id", p.deal_id).single(),
    supabase.from("expeditions").select("partner_id, partners(afiliado)").eq("id", c.expedition_id).single(),
  ]);
  const partnerAfiliado = (e?.partners as unknown as { afiliado: string } | null)?.afiliado;
  if (!d || !partnerAfiliado || d.afiliado !== partnerAfiliado) return { error: "O negócio não é deste parceiro." };

  const patch: Record<string, string> = {};
  if (p.hubspot_contact_id) patch.hubspot_contact_id = p.hubspot_contact_id;
  else if (p.email) patch.email = p.email;
  else if (p.phone) patch.phone = p.phone;
  else return { error: "O passageiro não tem contato, e-mail nem telefone para vincular." };
  if (p.email && !c.email) patch.email = p.email;
  const { error } = await supabase.from("clients").update(patch).eq("id", clientId);
  if (error) return { error: "Não foi possível vincular." };

  const no = `#${d.hubspot_id ?? d.seq}`;
  await supabase.from("client_comments").insert({
    client_id: clientId,
    body: `Vinculado manualmente ao passageiro “${p.name}” do negócio ${no}` + (p.hubspot_contact_id ? ` (contato ${p.hubspot_contact_id} no HubSpot).` : "."),
    internal: true,
    author_id: s.profile.id,
    author_name: s.profile.full_name || s.profile.email,
    author_email: s.profile.email,
  });
  revalidatePath("/", "layout");
  return { ok: `${p.name} vinculado a ${c.name}.` };
}

// Comentário sobre o cliente (protótipo v37). Só a Vay; o autor vem da sessão, não do formulário.
export async function addClientComment(clientId: string, body: string, internal: boolean): Promise<FormState> {
  const s = await requireVay();
  const text = body.trim();
  if (!text) return { error: "Escreva o comentário." };
  const supabase = await createClient();
  const { error } = await supabase.from("client_comments").insert({
    client_id: clientId,
    body: text,
    internal,
    author_id: s.profile.id,
    author_name: s.profile.full_name || s.profile.email,
    author_email: s.profile.email,
  });
  if (error) return { error: "Não foi possível salvar o comentário." };
  await supabase.from("clients").update({ last_follow_up: todayIso() }).eq("id", clientId);
  revalidatePath("/", "layout");
  return { ok: internal ? "Comentário interno adicionado." : "Comentário adicionado. O parceiro já vê." };
}

// ---------------------------------------------------------------- Cashback editado pela Vay (SPEC 1.3)

// value null = volta ao calculado pelas regras. Toda alteração vai para o histórico.
export async function setCashback(dealId: string, raw: string | null, note: string): Promise<FormState> {
  const s = await requireVay();
  let value: number | null = null;
  if (raw !== null && raw.trim() !== "") {
    const v = raw.replace(/[R$\s]/g, "");
    value = Math.round((Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v) || NaN) * 100) / 100;
    if (!(value >= 0)) return { error: "Informe um valor válido (0 ou mais)." };
  }
  const supabase = await createClient();
  const { data: d, error: rErr } = await supabase.from("deals").select("*").eq("id", dealId).single();
  if (rErr || !d) return { error: "Negócio não encontrado." };
  const old = d.cashback_override === null ? null : Number(d.cashback_override);
  if (old === value) return { ok: "Nada mudou." };
  const calculated = calculatedCashback({
    ...d,
    voo: Number(d.voo),
    hotel: Number(d.hotel),
    seguro: Number(d.seguro),
    payment_methods: d.payment_methods ?? [],
    cashback_override: null,
    passengers: [],
  });
  const { error: hErr } = await supabase.from("deal_cashback_history").insert({
    deal_id: dealId,
    old_value: old,
    new_value: value,
    calculated: Math.round(calculated * 100) / 100,
    note: note.trim(),
    changed_by: s.profile.id,
    changed_by_name: s.profile.full_name || s.profile.email,
  });
  if (hErr) return { error: "Não foi possível registrar a alteração." };
  const { error } = await supabase.from("deals").update({ cashback_override: value }).eq("id", dealId);
  if (error) return { error: "Não foi possível salvar o cashback." };
  revalidatePath("/", "layout");
  return { ok: value === null ? "Voltou ao cashback calculado." : "Cashback atualizado." };
}

// ---------------------------------------------------------------- Saldo (extrato)

const whoName = (s: Awaited<ReturnType<typeof requireVay>>) => s.profile.full_name || s.profile.email;

export async function addBalanceEntry(partnerId: string, _: FormState, f: FormData): Promise<FormState> {
  const s = await requireVay();
  const kind = str(f, "kind");
  const title = str(f, "title");
  const note = str(f, "note");
  const date = str(f, "entry_date") || todayIso();
  const v = str(f, "amount").replace(/[R$\s]/g, "");
  const amount = Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
  if (kind !== "in" && kind !== "out") return { error: "Escolha entrada ou saída." };
  if (!(amount > 0)) return { error: "Informe um valor maior que zero." };
  if (!title) return { error: "Informe o motivo." };
  if (!isIsoDate(date)) return { error: "Data inválida." };
  const supabase = await createClient();
  const { error } = await supabase.from("balance_entries").insert({
    partner_id: partnerId,
    kind,
    amount: Math.round(amount * 100) / 100,
    title,
    note,
    entry_date: date,
    created_by: s.profile.id,
    created_by_name: whoName(s),
  });
  if (error) return { error: "Não foi possível lançar." };
  revalidatePath("/", "layout");
  return { ok: kind === "in" ? "Entrada lançada no extrato." : "Saída lançada no extrato." };
}

export async function deleteBalanceEntry(entryId: string) {
  await requireVay();
  const supabase = await createClient();
  const { error } = await supabase.from("balance_entries").delete().eq("id", entryId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- Comentários e arquivos dos produtos

const PRODUCT_IDS = ["voo", "hotel", "seguro"];

// O arquivo já foi enviado ao Storage pelo navegador (bucket "anexos", pasta <deal_id>/<produto>/).
export async function addDealNote(dealId: string, product: string, body: string, file?: { path: string; name: string }): Promise<FormState> {
  const s = await requireVay();
  if (!PRODUCT_IDS.includes(product)) return { error: "Produto inválido." };
  const text = body.trim();
  if (!text && !file) return { error: "Escreva um comentário ou escolha um arquivo." };
  if (file && !file.path.startsWith(`${dealId}/${product}/`)) return { error: "Arquivo inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("deal_notes").insert({
    deal_id: dealId,
    product,
    body: text,
    file_path: file?.path ?? null,
    file_name: file?.name ?? null,
    created_by: s.profile.id,
    created_by_name: whoName(s),
  });
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/", "layout");
  return { ok: "Adicionado. O parceiro também vê." };
}

export async function deleteDealNote(noteId: string) {
  await requireVay();
  const supabase = await createClient();
  const { data } = await supabase.from("deal_notes").select("file_path").eq("id", noteId).single();
  if (data?.file_path) await supabase.storage.from("anexos").remove([data.file_path]);
  const { error } = await supabase.from("deal_notes").delete().eq("id", noteId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// Link temporário para baixar um anexo (as regras de acesso do Storage valem para quem pede).
export async function attachmentUrl(path: string): Promise<string | null> {
  await requireSession();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("anexos").createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
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

// Conferência: guarda quem conferiu, quando e quais avisos estavam no negócio (flagKeys).
// O registro fica em deal_reviews (só a Vay lê); deals.reviewed é o que o restante do sistema usa.
export async function setReviewed(dealId: string, reviewed: boolean, flagKeys: string[] = []) {
  const s = await requireVay();
  const supabase = await createClient();
  if (reviewed) {
    const { error } = await supabase.from("deal_reviews").upsert({
      deal_id: dealId,
      flags: flagKeys.filter((k) => /^[a-z_]+$/.test(k)),
      reviewed_by: s.profile.id,
      reviewed_by_name: s.profile.full_name || s.profile.email,
      reviewed_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("deal_reviews").delete().eq("deal_id", dealId);
    if (error) throw new Error(error.message);
  }
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
