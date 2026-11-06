// Sincronização agendada (Vercel Cron). Protegida por CRON_SECRET.
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
