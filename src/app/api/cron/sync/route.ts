// Sincronização agendada (Vercel Cron, todo dia às 08:00 UTC = 05:00 em Brasília; ver vercel.json).
// Protegida por CRON_SECRET: a Vercel envia "Authorization: Bearer <CRON_SECRET>" sozinha.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { syncHubspot } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await syncHubspot(createAdminClient());
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
