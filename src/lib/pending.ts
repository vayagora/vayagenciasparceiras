// Grava as pendências de cada expedição (passageiros de negócios da agência em "A conferir") para o parceiro.
// O parceiro não enxerga os negócios não sinalizados, então não consegue calcular sozinho quem está pendente.
// Roda com a chave de serviço depois de cada sincronização e de cada marcação da Vay (SPEC 2.4).
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildWorld } from "./data";

export async function refreshPending(admin: SupabaseClient): Promise<void> {
  const world = await buildWorld(admin, true);
  const rows = world.exps.flatMap((e) =>
    world.ledger.agencyPendingPeople(e.id).map((p) => ({ expedition_id: e.id, person_key: p.key, person_name: p.name })),
  );
  const { error: dErr } = await admin.from("expedition_pending").delete().not("expedition_id", "is", null);
  if (dErr) throw new Error(`pendências: ${dErr.message}`);
  if (rows.length) {
    const { error } = await admin.from("expedition_pending").insert(rows);
    if (error) throw new Error(`pendências: ${error.message}`);
  }
}
