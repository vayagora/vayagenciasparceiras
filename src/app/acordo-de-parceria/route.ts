// Abre o acordo de parceria: o arquivo próprio do parceiro, se houver; senão, o acordo padrão.
// Parceiro: o próprio. Vay: ?parceiro=<id>.
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_AGREEMENT = "/docs/regras-de-negocio-padrao.pdf";

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.redirect(new URL("/login", req.url));
  const partnerId = s.isVay ? req.nextUrl.searchParams.get("parceiro") : s.partner?.id;
  if (partnerId) {
    const supabase = await createClient();
    const { data: p } = await supabase.from("partners").select("agreement_path").eq("id", partnerId).maybeSingle();
    if (p?.agreement_path) {
      const { data } = await supabase.storage.from("anexos").createSignedUrl(p.agreement_path, 120);
      if (data?.signedUrl) return NextResponse.redirect(data.signedUrl);
    }
  }
  return NextResponse.redirect(new URL(DEFAULT_AGREEMENT, req.url));
}
