import Link from "next/link";
import { redirect } from "next/navigation";
import { Tip } from "@/components/ui";
import { pct, RATES } from "@/lib/commission";
import { requireSession } from "@/lib/data";
import { quarterOf, todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Acordo de parceria" };

// Resumo do acordo (protótipo v37). A redação completa é o PDF da rota /acordo-de-parceria
// (acordo próprio do parceiro ou o padrão "Regras de Negócio Padrões").
export default async function AcordoPage() {
  const s = await requireSession();
  if (s.isVay || !s.partner) redirect("/parceiros");
  const supabase = await createClient();
  const { data: p } = await supabase.from("partners").select("agreement_path, agreement_name").eq("id", s.partner.id).maybeSingle();
  const custom = !!p?.agreement_path;
  const name = custom ? p?.agreement_name || "Acordo próprio" : "Acordo padrão · Regras de Negócio Padrões";
  const now = quarterOf(todayIso()).q;
  const quarters = [
    { q: 1, label: "1º trimestre (jan–mar)", due: "até 10 de abril" },
    { q: 2, label: "2º trimestre (abr–jun)", due: "até 10 de julho" },
    { q: 3, label: "3º trimestre (jul–set)", due: "até 10 de outubro" },
    { q: 4, label: "4º trimestre (out–dez)", due: "até 10 de janeiro" },
  ];
  const rates = [
    { pct: pct(RATES.voo), label: "Passagens aéreas", bg: "var(--blue-50)", fg: "var(--blue-700)" },
    { pct: pct(RATES.hotel), label: "Hospedagem", bg: "var(--purple-50)", fg: "var(--purple-700)" },
    { pct: pct(RATES.seguro), label: "Seguro viagem", bg: "var(--yellow-100)", fg: "var(--yellow-900)" },
  ];
  const full = (
    <a href="/acordo-de-parceria" target="_blank" rel="noreferrer" className="btn outline">Ver redação completa</a>
  );
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Portal da agência</div>
          <div className="ttl">
            <h1 className="page-title">Acordo de parceria</h1>
            <Tip>Resumo dos pontos principais. Em caso de dúvida, vale a redação completa.</Tip>
          </div>
        </div>
        {full}
      </div>

      <section className="card pad row" style={{ justifyContent: "space-between" }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">Seu acordo</span>
          <span className="strong" style={{ fontSize: 16 }}>{name}</span>
          <span className="small muted">
            Parceria comercial não exclusiva, sem vínculo empregatício ou subordinação. Cada parte segue responsável pela própria gestão.
          </span>
        </div>
        {custom ? <span className="badge yellow">Documento próprio · confira a redação completa</span> : null}
      </section>

      <section className="card earn" aria-label="Quanto você recebe">
        <div className="earn-head"><h2 className="section-title">Quanto você recebe</h2></div>
        <div className="agr-grid" style={{ padding: "14px 16px" }}>
          {rates.map((r) => (
            <div key={r.label} className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
              <span className="rchip" style={{ padding: 2, border: 0, background: "none" }}><b style={{ background: r.bg, color: r.fg }}>{r.pct}</b></span>
              <span className="stack" style={{ gap: 0 }}>
                <span className="strong small">{r.label}</span>
                <span className="small muted">sobre o valor da compra</span>
              </span>
            </div>
          ))}
        </div>
        <div className="earn-rates">Vale para todo o trajeto do negócio gerado para a expedição, não para outras viagens dos mesmos compradores.</div>
      </section>

      <div className="agr-grid">
        <section className="card pad stack" style={{ gap: 8 }}>
          <h2 className="section-title">Como você recebe</h2>
          <ul className="agr-list">
            <li>Em <strong>créditos na Vay Agora</strong>, sem data de validade.</li>
            <li>Os créditos valem para emitir qualquer serviço da Vay Agora.</li>
            <li>Saldo e movimentações ficam no seu <Link href="/extrato">extrato</Link>.</li>
          </ul>
        </section>
        <section className="card pad stack" style={{ gap: 4 }}>
          <h2 className="section-title">Quando é apurado</h2>
          <span className="small muted">Trimestralmente, com relatório detalhado.</span>
          <div>
            {quarters.map((x) => (
              <div key={x.q} className={`qrow${x.q === now ? " next" : ""}`}>
                <span>{x.label}{x.q === now ? " · trimestre atual" : ""}</span>
                <span>{x.due}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="agr-grid">
        <section className="card pad stack" style={{ gap: 8 }}>
          <h2 className="section-title">O que cabe à sua agência</h2>
          <ul className="agr-list">
            <li>Vender e entregar a experiência principal (expedição, evento, intercâmbio ou viagem em grupo).</li>
            <li>Avisar a Vay Agora sempre que uma viagem ou grupo for confirmado.</li>
            <li>Repassar aos clientes a estimativa do aéreo enviada pela Vay Agora, deixando claro que o valor final depende da cotação na compra.</li>
            <li>Enviar à Vay Agora os contatos dos clientes com viagem confirmada.</li>
          </ul>
        </section>
        <section className="card pad stack" style={{ gap: 8 }}>
          <h2 className="section-title">O que cabe à Vay Agora</h2>
          <ul className="agr-list">
            <li>Enviar a estimativa de preço do aéreo para repasse aos clientes.</li>
            <li>Contatar os passageiros e oferecer aéreo, hospedagem, seguro viagem e outros serviços.</li>
            <li>Planejar voos e rotas compatíveis com o roteiro, e cuidar de reservas e emissões.</li>
            <li>Orientar sobre documentos de embarque (passaporte, vistos, vacinas, menores).</li>
            <li>Dar suporte aos passageiros antes, durante e depois da viagem.</li>
            <li>Manter o andamento dos atendimentos atualizado neste portal.</li>
          </ul>
        </section>
      </div>

      <div className="row" style={{ justifyContent: "center" }}>
        <a href="/acordo-de-parceria" target="_blank" rel="noreferrer" className="btn secondary">Ver redação completa do acordo</a>
      </div>
    </>
  );
}
