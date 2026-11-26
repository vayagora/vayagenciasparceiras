// Home pública de divulgação do Programa Empresas Parceiras (sem dados do banco, sem JavaScript no cliente).
// Textos do protótipo (Claude Design), com os trechos ajustados às regras atuais: apuração por expedição,
// portal só de visualização, ganhos por ano e contatos de quem quer receber a cotação.
import Image from "next/image";
import Link from "next/link";

const ico = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function HomeLanding() {
  return (
    <div className="lp">
      <header className="lp-hero">
        <div className="lp-wrap">
          <div className="lp-top">
            <Image src="/brand/logo-tipografico-porcelana.png" alt="Vay Agora" width={170} height={51} style={{ width: 170, height: "auto" }} priority />
            <Link className="btn-light" href="/login">Entrar</Link>
          </div>
          <div className="stack" style={{ gap: 20 }}>
            <div className="eyebrow">Programa Vay · Empresas Parceiras</div>
            <h1>Sua agência cuida da experiência. A Vay cuida da viagem.</h1>
            <p className="lead">
              Para empresas que organizam expedições, eventos, intercâmbios e viagens em grupo. Você indica os viajantes, a Vay cuida do
              aéreo, da hospedagem e/ou do seguro de cada um, e sua empresa recebe créditos sobre cada compra.
            </p>
            <div className="lp-pills" aria-label="Bonificação">
              <span className="lp-pill"><b>3%</b>passagens aéreas</span>
              <span className="lp-pill"><b>3%</b>hospedagem</span>
              <span className="lp-pill"><b>5%</b>seguro viagem</span>
            </div>
          </div>
        </div>
      </header>

      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-head">
            <div className="eyebrow">Como funciona</div>
            <h2 className="lp-h2">Três passos, do grupo confirmado ao crédito na conta</h2>
          </div>
          <div className="lp-steps">
            <div className="lp-step"><span className="n">1</span><span className="who">Sua empresa</span><h3>Confirma a viagem</h3><p>Nos avisa o destino, as datas e o aeroporto de chegada.</p></div>
            <div className="lp-step"><span className="n">2</span><span className="who">Vay</span><h3>Atende cada passageiro</h3><p>Nossa equipe cota, emite e acompanha cada viajante até a volta para casa, resolvendo prontamente qualquer problema no processo.</p></div>
            <div className="lp-step"><span className="n">3</span><span className="who">Sua empresa</span><h3>Acompanha e ganha</h3><p>Vê no portal quem já comprou, quem está em negociação e quanto a sua empresa já ganhou em créditos.</p></div>
          </div>
        </div>
      </section>

      <section className="lp-sec alt">
        <div className="lp-wrap">
          <div className="lp-head">
            <div className="eyebrow">O que a Vay faz pelos seus clientes</div>
            <h2 className="lp-h2">Toda a parte logística da viagem, com quem entende do assunto</h2>
            <p className="lp-sub">Sua empresa segue responsável pela experiência principal. A Vay entra como fornecedora recomendada e Hub Inteligente de Viagens.</p>
          </div>
          <div className="lp-cards">
            <div className="lp-card"><span className="lp-ico" aria-hidden="true"><svg {...ico}><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" /></svg></span><h3>Atendimento ativo</h3><p>Contatamos os passageiros indicados e oferecemos passagens, hospedagem, seguro e serviços complementares.</p></div>
            <div className="lp-card"><span className="lp-ico" aria-hidden="true"><svg {...ico}><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></svg></span><h3>Rotas pensadas para o roteiro</h3><p>Estudamos voos, conexões e rotas compatíveis com o cronograma da sua expedição.</p></div>
            <div className="lp-card"><span className="lp-ico" aria-hidden="true"><svg {...ico}><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></svg></span><h3>Reservas e emissões</h3><p>Cuidamos de reservas, emissões e solicitações especiais de cada viajante.</p></div>
            <div className="lp-card"><span className="lp-ico" aria-hidden="true"><svg {...ico}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></svg></span><h3>Assessoria documental</h3><p>Orientamos sobre passaporte, vistos, vacinas, formulários migratórios, conexões e viagem de menores.</p></div>
            <div className="lp-card"><span className="lp-ico" aria-hidden="true"><svg {...ico}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg></span><h3>Seguro viagem</h3><p>Seguro nacional e internacional, com coberturas alinhadas às exigências de cada destino.</p></div>
            <div className="lp-card"><span className="lp-ico" aria-hidden="true"><svg {...ico}><path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9" /></svg></span><h3>Suporte do começo ao fim</h3><p>Antes, durante e depois da viagem, inclusive junto às companhias aéreas em alterações e cancelamentos.</p></div>
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-head">
            <div className="eyebrow">Bonificação</div>
            <h2 className="lp-h2">Sua empresa ganha em cada compra dos viajantes que indicou</h2>
            <p className="lp-sub">Percentual sobre o valor da compra, por categoria. Vale para todo o trajeto do negócio gerado para a expedição.</p>
          </div>
          <div className="lp-rates">
            <div className="lp-rate" style={{ background: "var(--blue-50)", color: "var(--blue-700)" }}><span className="pct">3%</span><span className="lb">Passagens aéreas</span></div>
            <div className="lp-rate" style={{ background: "var(--purple-50)", color: "var(--purple-700)" }}><span className="pct">3%</span><span className="lb">Hospedagem</span></div>
            <div className="lp-rate" style={{ background: "var(--yellow-100)", color: "var(--yellow-900)" }}><span className="pct">5%</span><span className="lb">Seguro viagem</span></div>
          </div>
          <div className="lp-split">
            <div className="stack" style={{ gap: 14 }}>
              <ul className="lp-list">
                <li><span><strong>Pago em créditos na Vay</strong>, sem data de validade, para emitir qualquer serviço da Vay.</span></li>
                <li><span><strong>Apuração por expedição</strong>: quando a expedição termina, a Vay confirma que ela aconteceu e libera os créditos de uma vez, com relatório detalhado.</span></li>
                <li><span><strong>Tudo visível no portal</strong>: o saldo, o extrato e os ganhos de cada expedição. Até a liberação, o valor aparece como “a liberar”.</span></li>
              </ul>
            </div>
            <div className="lp-ex">
              <span className="eyebrow">Exemplo</span>
              <span>Um grupo de 20 viajantes, cada um com aéreo de R$ 6.000 e hospedagem de R$ 3.000:</span>
              <div className="calc">
                <span>3% de R$ 120.000 em aéreo</span><span>R$ 3.600</span>
                <span>3% de R$ 60.000 em hospedagem</span><span>R$ 1.800</span>
              </div>
              <span className="big">R$ 5.400 em créditos</span>
              <span className="small muted">Valores ilustrativos. Com seguro viagem, soma-se 5% sobre o valor do seguro.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec alt">
        <div className="lp-wrap lp-portal">
          <div className="stack" style={{ gap: 14 }}>
            <div className="eyebrow">O portal da sua empresa</div>
            <h2 className="lp-h2">Transparência em cada etapa</h2>
            <ul className="lp-list">
              <li><span><strong>Expedições</strong>: cada viagem confirmada aparece no portal com a lista dos seus clientes, atualizada pela equipe Vay.</span></li>
              <li><span><strong>Andamento de cada cliente</strong>: quem está em contato, quem está em negociação e quem já comprou.</span></li>
              <li><span><strong>Ganhos por expedição</strong>: créditos de cada viagem e por produto, com visão por ano.</span></li>
              <li><span><strong>Extrato</strong>: entradas e uso dos créditos, como uma conta corrente.</span></li>
            </ul>
          </div>
          <div className="lp-mock" aria-hidden="true">
            <div className="bal"><span className="small" style={{ opacity: 0.85 }}>Saldo atual</span><b>R$ 5.400,00</b><span className="small" style={{ opacity: 0.85 }}>Créditos na Vay · sem validade</span></div>
            <div className="row2"><span className="strong" style={{ minWidth: 0, flex: "1 1 140px" }}>Expedição Patagônia</span><span className="bar"><span style={{ width: "75%" }} /></span><span className="muted">15 de 20</span></div>
            <div className="row2"><span className="strong" style={{ minWidth: 0, flex: "1 1 140px" }}>Congresso em Lisboa</span><span className="bar"><span style={{ width: "40%" }} /></span><span className="muted">8 de 20</span></div>
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-head">
            <div className="eyebrow">A parceria</div>
            <h2 className="lp-h2">Simples, sem exclusividade</h2>
            <p className="lp-sub">Uma aliança comercial de cooperação mútua. Não há vínculo empregatício, exclusividade obrigatória nem subordinação: cada empresa segue responsável pela própria gestão.</p>
          </div>
          <div className="lp-split" style={{ marginTop: 0 }}>
            <div className="lp-card">
              <h3>O que cabe à sua empresa</h3>
              <ul className="lp-list">
                <li><span>Vender e entregar a experiência principal: expedição, evento, intercâmbio ou viagem em grupo.</span></li>
                <li><span>Avisar a Vay quando uma viagem for confirmada.</span></li>
                <li><span>Repassar aos clientes a estimativa de preço do aéreo enviada pela Vay.</span></li>
                <li><span>Compartilhar os contatos dos viajantes confirmados que querem receber a cotação de passagem.</span></li>
              </ul>
            </div>
            <div className="lp-card">
              <h3>O que cabe à Vay</h3>
              <ul className="lp-list">
                <li><span>Enviar a estimativa de preço do aéreo para sua empresa repassar.</span></li>
                <li><span>Atender, cotar e emitir para cada passageiro indicado.</span></li>
                <li><span>Dar suporte aos viajantes antes, durante e depois da viagem.</span></li>
                <li><span>Manter o portal atualizado com o andamento de cada cliente.</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <span>Vay · Hub Inteligente de Viagens</span>
          <span>Já é parceiro? <Link className="back-light" href="/login">Entrar no portal</Link></span>
        </div>
      </footer>
    </div>
  );
}
