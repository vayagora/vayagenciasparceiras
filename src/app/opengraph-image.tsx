// Imagem da prévia (WhatsApp, e-mail) da home de divulgação: fundo roxo da marca com o logo.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Vay · Programa Empresas Parceiras";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  const logo = await readFile(path.join(process.cwd(), "public/brand/logo-tipografico-porcelana.png"));
  const src = `data:image/png;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#715BCA", color: "#fff" }}>
        <img src={src} alt="Vay Agora" width={300} style={{ height: "auto" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 26, letterSpacing: 4, textTransform: "uppercase", opacity: 0.8 }}>Programa Vay · Empresas Parceiras</div>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.05, maxWidth: 980 }}>Sua agência cuida da experiência. A Vay cuida da viagem.</div>
          <div style={{ display: "flex", gap: 16, fontSize: 30 }}>
            <span>3% aéreo</span><span>·</span><span>3% hospedagem</span><span>·</span><span>5% seguro</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
