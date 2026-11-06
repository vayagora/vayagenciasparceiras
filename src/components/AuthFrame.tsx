import Image from "next/image";

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="login">
      <div className="brandside">
        <Image src="/brand/logo-tipografico-porcelana.png" alt="Vay Agora" width={200} height={60} style={{ width: 200, height: "auto" }} priority />
        <div className="stack" style={{ maxWidth: 460, gap: 18 }}>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,.75)" }}>Portal de agências parceiras</div>
          <h1>Você viaja, a gente cuida dos detalhes.</h1>
          <p>Inicie expedições, cadastre seus clientes e acompanhe seus ganhos.</p>
        </div>
        <div style={{ fontSize: 13, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(255,255,255,.7)" }}>
          Hub Inteligente de Viagens
        </div>
      </div>
      <div className="formside">
        <div>{children}</div>
      </div>
    </div>
  );
}
