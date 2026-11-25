# Sistema de Empresas Parceiras — Especificação técnica

Versão 2.6 · baseada no protótipo aprovado (canvas "Vay Agora — Expedições com parceiros") e no acordo
"Vay Agência parceira — Regras de Negócio Padrões" (`public/docs/regras-de-negocio-padrao.pdf`).

**Mudanças na 2.6 — negócio sinalizado sempre cai em alguma expedição do parceiro:**
1. No negócio **sinalizado** (Origem + empresa), o **aeroporto de saída** de cada trecho também conta como lugar visitado naquela data (ex.: passagem só de volta Fernando de Noronha → Palmas entra em Noronha). No não sinalizado continua valendo só a chegada.
2. Negócio sinalizado cujo destino/datas não batem com nenhuma expedição do parceiro vai para **"A conferir" da expedição do parceiro de data mais próxima** ("Destino/datas não batem"). A Vay decide: **"Marcar como passageiros"** (entra na lista e remunera; vale para os passageiros daquele momento) ou **"Marcar como conferido"** (não é desta expedição: sai da conferência e não remunera). Enquanto pendente, bloqueia a conclusão. Só fica "sem expedição" (Visão geral) se o parceiro não tiver nenhuma expedição.

**Mudanças na 2.5 — hospedagem e seguro:** o destino desses negócios é texto livre e costuma vir como país ou região ("Ásia", "Europa").
1. **Negócio da agência (sinalizado) com passagem do mesmo passageiro:** se um passageiro do negócio de hospedagem/seguro tem passagem aérea da agência numa expedição (mesmo contato do HubSpot ou mesmo nome completo) e as datas são compatíveis com ela, o negócio entra nessa expedição. Se a passagem tiver pendência, tudo fica em "A conferir" (regra do grupo).
2. **Negócio da agência sem passagem do mesmo passageiro:** destino + data; se o destino não é cidade (país/região), **só a data**, entre as expedições do parceiro (vínculo por aproximação).
3. **Não sinalizado:** destino + data (+ parceiro pela empresa, se houver) → "A conferir". Com destino que não é cidade, não há como confirmar e ele não aparece.

**Mudanças na 2.4 — negócio conjunto, pendências por passageiro, concluir e reabrir (prevalece sobre 2.1 e 2.2):**

1. Negócio da agência (Origem "Agência parceira" + empresa associada) com **um** passageiro vai direto para **Passageiros**.
2. Negócio da agência com **vários** passageiros (negócio conjunto) vai para **A conferir**. Se todos viajam, a Vay usa **"Marcar como passageiros"** (o negócio inteiro vai para a lista). Se alguém não viaja (acompanhante), **não se resolve no sistema**: separa-se em negócios diferentes no HubSpot. Em Passageiros, o negócio conjunto aprovado tem **"Voltar para conferência"** (o negócio inteiro volta).
3. A aprovação vale para os passageiros daquele momento (`expedition_approvals.passenger_keys`, migração 0017): se entrar ou sair alguém do negócio no HubSpot, **todos voltam para A conferir**.
4. Negócio **não sinalizado** que combina com a expedição: **A conferir**; sem botão "Marcar como passageiros" (corrige no HubSpot) ou **"Marcar como conferido"** (não é da expedição; vai para **Conferidos**). Negócio conjunto nunca vai para Conferidos.
5. **Qualquer pendência** do passageiro na expedição (negócio conjunto não conferido, composição que mudou, negócio não sinalizado não conferido) deixa ele **inteiro** em A conferir, e quem está no mesmo negócio vai junto (o grupo nunca se divide).
6. **Ordem**: alfabética, com quem está no mesmo negócio junto (sub-linha). Para a Vay, cada linha mostra onde estão os outros passageiros do mesmo negócio (rastreio entre abas).
7. **Pendências de lançamento** (parceiro): só os nomes dos passageiros pendentes de negócios da própria agência. O sistema grava essas pendências (`expedition_pending`) a cada sincronização e a cada marcação da Vay, porque o parceiro não enxerga os negócios não sinalizados.
8. **Expedição que já passou da data de fim e não foi concluída**: a Vay vê o aviso na Visão geral ("N expedições já terminaram e precisam ser concluídas"), o selo "Precisa ser concluída" no topo da lista de expedições e um aviso na tela da expedição; o parceiro vê "Aguardando conclusão". Só as concluídas vão para a seção recolhida "Expedições concluídas".
9. **Concluir expedição** (Vay, a qualquer momento; avisa se a data de fim não passou): **bloqueada** enquanto houver negócio da agência em A conferir (ficaria fora da apuração). Registra o valor apurado; o parceiro vê **Concluída**. **Reabrir** (Vay) descarta o valor apurado, com aviso.
10. Só remunera o negócio da agência que está na lista (ganho, vinculado e sem pendência).

**Mudanças na 2.3 — créditos vindos do HubSpot (como no sistema de comissários):**

1. **Saldo atual** = campo **"Créditos abertos"** (`creditos_abertos`) da **Empresa** da agência no HubSpot (empresa com o mesmo nome do parceiro).
2. **Extrato** = registros do objeto **"Créditos"** (objeto padrão Course, `0-410`) associados à empresa: data (criação), lançamento, motivo e valor. Acúmulo respeita o sinal do "[ACÚMULO] Valor creditado" (há acúmulos negativos, ex.: estorno); Uso é saída. O saldo depois de cada lançamento é calculado de trás para frente a partir do saldo atual. Se o saldo não bater com a soma, a Vay vê a diferença.
3. Sincronizados a cada sincronização (`credit_entries`, migração 0016; só leitura no sistema). Falha nos créditos não impede a sincronização dos negócios.
4. **"Finalizar expedição"** passa a registrar o **valor apurado** (congelado em `expeditions.finished_amount`). O crédito é lançado pela equipe no HubSpot (objeto Créditos da empresa) e aparece no extrato na sincronização. Ganho de expedição não finalizada continua como **"a liberar"**.
5. Lançamentos manuais antigos do sistema (`balance_entries`) deixam de aparecer.

**Mudanças na 2.2 — pendências de lançamento na visão do parceiro:** na tela da expedição, o parceiro vê a seção **"Pendências de lançamento"** com **só os nomes** dos passageiros "A conferir" de negócios marcados como da agência dele no HubSpot (Origem "Agência parceira" + empresa associada; na prática, negócios com mais de um passageiro). Não aparecem: negócios não sinalizados (sem origem ou sem a empresa), passageiros "Conferidos" e quem já está em Passageiros. Feito no banco pela função `partner_pending_names` (migração 0015), que devolve só o nome; a expedição de cada negócio da agência é gravada na sincronização (`deals.matched_expedition_id`).

**Mudanças na 2.1 — conferência por passageiro (prevalece sobre a 2.0 onde houver conflito):**

1. Cada expedição tem três abas (as duas últimas só para a Vay): **Passageiros**, **A conferir** e **Conferidos**.
2. **Passageiros** só é preenchido pela **sincronização**: negócio com Origem "Agência parceira" **+ empresa da agência associada** e **um único passageiro** (contato com rótulo "Passageiro"; comprador que não viaja não conta), vinculado à expedição por destino e data. É a lista que o parceiro vê e a única que remunera.
3. **A conferir**: passageiros de (a) negócio da agência com **mais de um passageiro** e (b) negócio **não sinalizado** no HubSpot que combina com a expedição. A Vay **não** move ninguém para Passageiros: se for erro no HubSpot, corrige lá (ex.: um negócio por passageiro; origem e empresa) e a próxima sincronização leva a pessoa para Passageiros. Se não for cliente da expedição, a Vay marca **"Conferido"** (pode voltar para "A conferir").
4. **Conferidos**: marcação da Vay por pessoa e expedição (`expedition_reviews`, migração 0014; quem e quando). Em cada sincronização a busca é refeita; quem está em Conferidos ou em Passageiros não volta para "A conferir".
5. "Afiliado" (método antigo) não conta como negócio de agência: com data e destino de uma expedição, vai para "A conferir" pedindo a troca da origem para "Agência parceira".
6. O parceiro só vê negócios da própria agência com um passageiro (RLS, migração 0014). Negócio da agência sem expedição compatível aparece para a Vay na Visão geral.

**Mudanças na 2.0 — o sistema passa a ser só visualização (prevalece sobre o resto do documento onde houver conflito):**

1. **Nenhum dado é lançado no sistema.** Todo lançamento é feito pela equipe de atendimento no HubSpot. O sistema serve ao gestor do projeto (Vay) e às agências parceiras para visualizar. Saem: cadastro e importação de clientes, etapa e responsável marcados no sistema, comentários, vincular passageiro, trocar expedição do negócio, marcar conferido, editar cashback, comentários/arquivos por produto, lançamentos manuais no extrato e negócio lançado à mão. A lista cadastrada e os comentários foram apagados (migração 0013).
2. **Negócio de agência parceira** = "Origem do Negócio" = **"Agência Parceira"** (ou "Afiliado", nome antigo) **+ empresa da agência associada ao negócio**, em **qualquer etapa** do funil (em aberto, ganho ou perdido).
3. **Lista de clientes da expedição** = passageiros desses negócios cujo roteiro combina com a expedição (destino e data, §4.4). Uma linha por pessoa (contato do HubSpot; sem contato, nome completo); valores e comissão uma vez por negócio, na linha do titular (ou do primeiro passageiro que viaja).
4. **Etapa do cliente** = etapa do negócio no HubSpot: Pré Cotação / Realizar Cotação → **Em contato**; demais etapas em aberto → **Em negociação**; Emissão Realizada → **Compra concluída**; Negócio perdido → **Não comprou**. Com vários negócios, vale a mais avançada. A observação é o campo "Observações para parceiro" do negócio.
5. **Vínculo sempre automático.** Mais de uma expedição compatível → a de maior pontuação (aviso só informativo); aproximação → informativo. Pendências da Vay (corrigir no HubSpot): negócio **não sinalizado** compatível com uma expedição (ganho ou em aberto) e negócio da agência **sem expedição compatível**. Corrigido no HubSpot, sai da pendência na próxima sincronização. Só remunera negócio **ganho** vinculado.
6. **Fechamento por expedição (substitui a apuração trimestral do acordo, cláusula 4.3).** Os créditos só entram no saldo quando a Vay **finaliza a expedição** (botão "Finalizar expedição", disponível depois da data de fim), confirmando que ela aconteceu. O sistema calcula o ganho dos negócios ganhos vinculados e lança **um** crédito no extrato ("Créditos da expedição …", migração 0013, um por expedição). Depois disso o valor não muda (período fechado). Antes, o ganho aparece como **"a liberar"**.
7. **Expedições**: só a Vay cria (no painel do parceiro). O parceiro só vê.
8. **Ainda a definir:** saídas (uso dos créditos) e ajuste de cashback de pagamento misto. Por enquanto, misto fica com cashback R$ 0 e aviso informativo; lançamentos manuais antigos continuam no extrato.

**Mudanças na 1.8:** conferência registra quem conferiu, quando e quais avisos existiam; aviso novo depois disso volta o negócio para "Para conferir"; cada negócio vira uma linha compacta e os detalhes/ações abrem num modal. Afeta §4.5.

**Mudanças na 1.7:** rótulos de associação "Comprador" e "Passageiro" do HubSpot (comprador que não viaja não conta como passageiro; quem viajou sem comprar mostra "comprado por …"); "Comprador" também marca o titular; negócio com um contato só não precisa de rótulo; reconhecimento pelo nome ignora de/da/do/das/dos/e. Afeta §3, §4.3 e §6.

**Mudanças na 1.6:** passageiro e cliente também se reconhecem pelo nome completo (com sinalização "Vinculado pelo nome"), e a Vay pode vincular manualmente um passageiro a um cliente da lista. Afeta §3 e §4.4.

**Mudanças na 1.5:** comentários por cliente (públicos ou internos, com data, hora e autor) no lugar da observação escrita no sistema e da nota interna; a observação principal é a do HubSpot. Afeta §3 e §5.

**Mudanças na 1.4:** acompanhamento do contato no sistema (status do contato e responsável marcados pela Vay); observação para o parceiro escrita no sistema até existir negócio, e depois só pelo campo "Observações para parceiro" do negócio no HubSpot. Afeta §3 e §5.

**Mudanças na 1.3:** (1) cliente recorrente: toda compra ligada a uma expedição da agência remunera, mesmo que não seja a primeira compra do cliente; compras fora das expedições da agência não remuneram. (2) acompanhante que não está na expedição deve ir num negócio separado; negócio que mistura passageiro da expedição com acompanhante fora dela é apontado como inconsistência. (3) forma de pagamento: dinheiro gera cashback; 100% "Crédito na VAY" entra no sistema sem cashback; pagamento misto vai para conferência e a Vay define o cashback final, com histórico de alterações. Afeta §1, §4.4, §4.5, §5 e §6.

**Mudanças na 1.2:** passagem aérea passa a 3% (acordo, item 4.1); saldo e extrato de créditos; etapa do cliente
pelo HubSpot (não contactado · em negociação · compra concluída) + marcações manuais da Vay; modal de voo,
hospedagem e seguro com comentários e arquivos; observação do HubSpot; expedição com destino livre, datas de
início e fim e aeroportos preferenciais; negócio de agência = origem "Afiliado" + empresa associada; negócios
encontrados por destino e data mas não sinalizados; botão do acordo de parceria. Afeta §1, §3, §4, §5, §6 e §7.

**Mudanças na 1.1:** negócios com vários passageiros (ex.: casal em um único negócio). Uma linha por passageiro, com o número do negócio; valores e comissão contados uma vez por negócio. Afeta §3, §4.2, §4.3, §4.4, §5, §6 e §8.

## 1. Objetivo

Empresas parceiras da Vay Agora organizam **expedições** (viagens em grupo: congressos, feiras, intercâmbios) e indicam **clientes**. A Vay Agora faz a venda (voo, hospedagem, seguro) pelo HubSpot. O parceiro é remunerado por comissão sobre os negócios vinculados às suas expedições.

| Produto | Comissão do parceiro |
|---|---|
| Passagem aérea | 3% |
| Hospedagem | 3% |
| Seguro viagem | 5% |

A comissão é calculada sobre o **valor do negócio**, não por passageiro. Um negócio com dois passageiros gera uma única comissão sobre o valor total.

**Quais compras remuneram (cashback):**

- **Toda compra ligada a uma expedição da agência** remunera, inclusive de clientes recorrentes: se o mesmo cliente faz várias expedições com a agência, cada uma remunera, mesmo que não seja a primeira compra dele na Vay. Isto é uma exceção à regra de "primeira compra" do acordo (item 4.1).
- Compras que **não** são de expedições da agência (ex.: o cliente volta a viajar com a Vay por conta própria) **não** remuneram.
- Só remunera o **passageiro que está na expedição**. Acompanhante que não faz parte da expedição vai em **outro negócio** no HubSpot, sem a marcação de agência. Negócio com os dois juntos é apontado como inconsistência (§4.4).
- **Forma de pagamento** (campo "Forma de pagamento do cliente"):
  - pago com dinheiro (cartão, Pix, boleto, link etc.) → gera cashback;
  - 100% "Crédito na VAY" → entra no sistema, mas **não** gera cashback (já foi um abatimento de crédito);
  - misto (parte em crédito, parte em dinheiro) → vai para conferência; o cashback fica **a definir** (R$ 0) até a Vay informar o valor final.
- A Vay pode **editar o cashback** de qualquer negócio; cada alteração fica no histórico (valor anterior → novo, quem, quando, motivo), visível num mini modal.

A comissão é paga em **créditos na Vay Agora**, sem validade, que a agência usa para emitir qualquer serviço da Vay (acordo, item 4.2). O **saldo** é: comissões dos negócios vinculados + entradas lançadas pela Vay (ex.: bonificações) − saídas (uso dos créditos).

O acordo de parceria padrão é o PDF "Regras de Negócio Padrões"; a Vay pode substituir por um documento próprio de cada parceiro.

## 2. Perfis e acesso

| Perfil | Quem | Vê |
|---|---|---|
| `vay` | Equipe Vay Agora | Tudo: todos os parceiros, expedições, clientes, negócios, conciliação |
| `partner` | Usuário de uma empresa parceira | **Somente** as expedições da própria empresa e os clientes que ela cadastrou |

- Login por e-mail e senha. Um único login; o perfil define o que é exibido.
- O isolamento entre parceiros é garantido **no banco (RLS)**, nunca só na interface.
- O parceiro **não** vê: se o cliente já existia no HubSpot, a identidade de clientes fora da lista dele (inclusive passageiros de um negócio que ele não cadastrou), sinalizações internas.
- O botão "Visão: Empresa parceira / Vay Agora" do protótipo é apenas de demonstração. Em produção, a Vay Agora acessa o painel de um parceiro pela tela Parceiros.

## 3. Entidades

- **Parceiro**: nome (é exatamente a opção do campo "afiliado" no HubSpot), e-mail de contato, ativo.
- **Usuário**: vinculado a um perfil `vay` ou a um parceiro.
- **Expedição**: parceiro, nome, cidade de destino (com latitude/longitude), data de início, duração em dias. Término = início + duração − 1.
- **Cliente da expedição** (cadastro do parceiro): uma pessoa por registro. Expedição, nome, e-mail (obrigatório no cadastro manual), telefone, ID do contato no HubSpot, `hubspot_status` (`novo` | `existente`, visível só para a Vay), etapa de follow-up, nota, data do último follow-up.
- **Negócio HubSpot** (espelho): ID, afiliado, data de fechamento, roteiro (trechos: cidade + data de chegada), data de volta, valores de voo/hospedagem/seguro.
- **Passageiro do negócio** (espelho das associações negócio → contato no HubSpot): negócio, ID do contato, nome, e-mail, telefone, `titular` (sim/não). Relação **muitos para muitos**: um negócio pode ter vários passageiros e um passageiro pode estar em vários negócios. Cada negócio tem exatamente um titular.
- **Vínculo negócio → expedição**: expedição (ou nenhuma), método (`auto` | `manual`), motivo (texto), sinalizações, conferido por/em.
- **Fechamento da expedição** (SPEC 2.0): expedição, quem finalizou e quando; crédito lançado no extrato (um por expedição), valor congelado.

Etapa do cliente (SPEC 1.4). O **acompanhamento do contato é feito pela Vay no sistema**; a **venda vem do HubSpot**:

- **Compra concluída**: negócio na etapa de venda concluída ("Emissão Realizada") compatível com a expedição (destino e data) em que o cliente é passageiro, ou cliente passageiro de negócio vinculado. Prevalece sobre tudo.
- **Não contactar** / **Comprou em outro lugar**: marcados pela Vay no sistema.
- **Em negociação**: negócio em qualquer etapa antes da compra (menos "Negócio perdido"), compatível com a expedição.
- **Tentando contato** / **Em contato** / **Chamar depois**: status do contato marcados pela Vay no sistema.
- **Não contactado**: nada marcado e nenhum negócio.

Para cada cliente a Vay também registra no sistema o **Responsável** (quem da equipe Vay está fazendo o contato; o parceiro vê o nome).

**Observação e comentários (SPEC 1.5):**

- **Observação principal** = campo "Observações para parceiro" do(s) negócio(s) do cliente no HubSpot. Aparece no topo, com a etiqueta "HubSpot".
- **Comentários**: histórico por cliente, registrado pela Vay no sistema. Cada comentário tem data e hora (America/Sao_Paulo), autor (nome e e-mail de login, tirados da sessão) e é **para o parceiro** (público) ou **interno** (só a Vay). Não se edita nem se apaga.
- O parceiro vê a observação do HubSpot e só os comentários **públicos** dos próprios clientes; não escreve comentários.

Cliente ↔ contato do HubSpot: por e-mail; sem e-mail, por telefone (Telefone, Celular ou WhatsApp).

**Correspondência cliente ↔ passageiro (SPEC 1.6):**
1. mesmo ID de contato no HubSpot; sem ID, mesmo e-mail; sem e-mail, mesmo telefone normalizado (só dígitos, últimos 11);
2. se nada disso bater, **mesmo nome completo** (sem diferenciar acentos, maiúsculas, espaços e as partículas de/da/do/das/dos/e; só o primeiro nome não basta), desde que o cliente não tenha sido ligado a outro passageiro do mesmo negócio. O negócio recebe a sinalização **"Vinculado pelo nome"** (pendência até a Vay marcar como conferido);
3. se ainda assim não bater (apelido, nome incompleto), a Vay usa **"Vincular"** na linha do passageiro e escolhe o cliente da lista: o contato do HubSpot fica gravado no cliente e o vínculo é registrado num comentário interno.

O parceiro vê o passageiro ligado pelas regras 1 e 2 (RLS); pela 3, porque o cliente passa a ter o contato do HubSpot.

**Comprador e passageiros (SPEC 1.7):** no HubSpot, os contatos do negócio têm os rótulos de associação **"Comprador"** (quem pagou) e **"Passageiro"** (quem viaja). Só os passageiros entram na correspondência com a lista do parceiro; um comprador que não viaja (ex.: pai que compra para a filha) não conta como acompanhante. Para o passageiro que não foi o comprador, a etapa mostra "Compra concluída · comprado por {comprador}" (o parceiro só vê o nome do comprador se ele também for cliente cadastrado dele). Sem nenhum rótulo "Passageiro" no negócio, todos os contatos contam como passageiros.

## 4. Fluxos

### 4.1 Parceiro inicia expedição
Campos: nome, destino (texto livre), data de início, data de fim, **aeroporto preferencial de chegada** (obrigatório; é por ele que o sistema encontra as compras) e aeroporto preferencial de saída (opcional). Após criar, abre a tela da expedição com o cadastro de clientes aberto.

### 4.2 Parceiro cadastra clientes
- **Uma pessoa por cadastro.** Casal ou família = um cadastro para cada pessoa (ex.: Emerson e Gislaine são dois clientes). Texto de apoio (tooltip) na tela de cadastro: "Cadastre cada viajante separadamente, mesmo quando viajam juntos."
- **Manual**: nome, e-mail (obrigatório e válido), telefone.
- **Planilha**: CSV/TSV ou linhas coladas do Excel/Google Planilhas. Colunas nome, e-mail, telefone (cabeçalho opcional, detecta `;`, `,` ou tab). Pré-visualização antes de confirmar. Linhas sem nome ou sem e-mail e telefone são ignoradas.
- Duplicado na mesma expedição (mesmo e-mail, ou mesmo telefone quando não há e-mail) não é inserido; o parceiro é avisado.
- **Upsert no HubSpot** para cada cliente novo:
  1. procura contato por e-mail; sem e-mail, por telefone normalizado (só dígitos, últimos 11);
  2. encontrou → reaproveita, `hubspot_status = existente`, não sobrescreve dados do contato;
  3. não encontrou → cria, `hubspot_status = novo`.
- Nenhuma marcação de parceiro é gravada no contato.
- Um mesmo cliente pode estar em várias expedições, de vários parceiros.

### 4.3 Venda e marcação no HubSpot
O vendedor fecha o negócio e escolhe a empresa no campo **"afiliado"** do negócio (dropdown). Ao cadastrar um parceiro no sistema, a opção é criada automaticamente nesse campo.

**Passageiros:** quando um negócio cobre mais de um viajante, o vendedor **associa todos os viajantes ao negócio** (um contato por pessoa). O titular é marcado com o rótulo de associação **"Titular"** (criado na conta HubSpot). Sem rótulo, o sistema considera titular o contato associado há mais tempo e sinaliza "Titular não definido" à Vay. Se o vendedor não associar os acompanhantes, eles aparecem no sistema sem compra; isso é responsabilidade do processo de venda, não do sistema.

### 4.4 Sincronização e vínculo (núcleo do sistema)
Periódica (ex.: a cada hora) e sob demanda ("Sincronizar com HubSpot"). Importa negócios **fechados/ganhos** com "afiliado" preenchido, **com todos os contatos associados** (passageiros).

Para cada negócio, candidatas = expedições do parceiro cujo nome = afiliado. Uma expedição é compatível quando:

- **Data**: o período da viagem (primeira chegada → volta) se sobrepõe à janela `[início − 7 dias, término + 3 dias]`.
- **Destino**: algum trecho do roteiro é a cidade da expedição, ou fica a até **700 km** dela (haversine).

Tolerâncias (7, 3, 700) são configuráveis, com padrão global.

Pontuação: `100 − km/10 − |dias entre a 1ª chegada e o início| × 3`. Vence a maior.

Resultado e sinalizações:

| Situação | Ação | Sinalização (visível só à Vay) |
|---|---|---|
| Cidade exata no roteiro e 1ª chegada até 1 dia antes do início | vincula | — ("Vínculo exato") |
| Compatível, mas por cidade próxima ou datas fora disso | vincula | Vínculo por aproximação |
| Mais de uma expedição compatível | vincula à de maior pontuação | Mais de uma expedição possível |
| **Nenhum** passageiro do negócio está na lista daquela expedição | vincula e **remunera** | Cliente fora da lista do parceiro |
| Pelo menos um passageiro está na lista, mas outros não | vincula e **remunera** | Acompanhante fora da expedição (pendência: separar o negócio no HubSpot ou ajustar o cashback) |
| Pago 100% com "Crédito na VAY" | vincula, **sem cashback** | Pago com créditos (informativa) |
| Pagamento misto (crédito + dinheiro), cashback ainda não definido | vincula, cashback **a definir** (R$ 0) | Pagamento misto (pendência até a Vay definir o cashback) |
| Cashback editado pela Vay | vale o valor editado | Cashback ajustado (informativa, com histórico) |
| Passageiro ligado ao cliente só pelo nome completo | vincula normalmente | Vinculado pelo nome (pendência até conferir) |
| Negócio sem rótulo "Titular" em nenhum contato | vincula normalmente | Titular não definido |
| Nenhuma compatível | não vincula, **não remunera** | Nenhuma expedição encontrada |

Basta **um** passageiro do negócio estar na lista para o negócio contar como "na lista" (ex.: titular Emerson não cadastrado, Gislaine cadastrada → não é "fora da lista").

O motivo é gravado em texto, ex.: "Roteiro Lisboa (09/11) → Madrid (13/11): Madrid está no roteiro; a viagem começa 4 dias antes da expedição (13/11)."

Negócios fechados fora de expedições não geram remuneração.

### 4.5 Conferência (na tela da expedição, perfil Vay)
Seção "Negócios do HubSpot" na tela de cada expedição:
- negócios vinculados à expedição + negócios do mesmo parceiro sem expedição;
- por negócio: número, passageiros (titular destacado; os não cadastrados marcados), roteiro, datas, valores, comissão, motivo (tooltip), sinalizações;
- cada negócio é **uma linha compacta** (número, primeiro aviso pendente + quantidade, titular, roteiro curto, cashback); clicar abre um **modal** com os detalhes e as ações;
- a seção se divide em **"Para conferir"** (no topo) e **"Demais negócios"** (recolhida: conferidos e sem pendência). Conferido mostra "Conferido por {pessoa} em dd/mm/aaaa" e os avisos em cinza;
- ações (no modal): trocar expedição (automática / outra expedição do parceiro / sem expedição), "Vincular a esta expedição", "Marcar como conferido" / desfazer;
- **a conferência vale para os avisos que existiam no momento** (tabela `deal_reviews`, só a Vay lê; migração 0012). Se aparecer um aviso novo depois, o negócio volta para "Para conferir" ("Já foi conferido antes, mas apareceu um aviso novo"). Conferências antigas, sem esse registro, continuam valendo;
- todo ajuste manual fica registrado (quem, quando, de → para).

- ação "Editar cashback": valor final + motivo; o histórico de alterações abre num mini modal.

Pendências (sinalizados e não conferidos) aparecem: no card da expedição, na Visão geral (lista de expedições com pendência). "Pago com créditos" e "Cashback ajustado" não contam como pendência; "Pagamento misto" deixa de ser pendência quando a Vay define o cashback.

### 4.6 Follow-up (perfil Vay)
Por cliente: etapa e nota. Salvar grava a data (fuso America/Sao_Paulo). Compras e valores não são editados aqui: vêm do HubSpot.

## 5. Telas

> **Navegação e telas atuais: protótipo v37** (canvas "Vay Agora — Expedições com parceiros"). Onde os itens abaixo divergirem, vale este resumo:
> - **Parceiro**: menu Expedições, Extrato e Acordo de parceria. A aba **Expedições** junta o painel e as expedições, igual à tela do parceiro na Vay: no topo o bloco "Ganhos" (saldo, ganhos do período, negócios fechados, clientes cadastrados e ganhos por produto), abaixo a lista empilhada de expedições com "Iniciar expedição". O Acordo de parceria tem o resumo + "Ver redação completa", que abre o PDF.
> - **Vay**: menu Visão geral (KPIs, conferência, resultado por parceiro e todas as expedições) e Parceiros (um por linha; "Novo parceiro" em modal). No painel de cada parceiro: bloco "Ganhos", botão do acordo e as expedições dele, com "Iniciar expedição".
> - **Tabela de clientes** (expedição): busca, filtros de etapa e responsável, ordenação A–Z/Z–A, exportar para Excel (linhas filtradas); etapa e responsável editáveis na linha pela Vay; observação em uma linha que abre o modal de comentários; coluna Cliente congelada.

**Parceiro**
- Painel: **Saldo atual** em destaque (com "Ver extrato") e botão "Acordo de parceria". Filtro Ano + Trimestre (jan–mar, abr–jun, jul–set, out–dez, ou ano inteiro). Padrão: último trimestre concluído em UTC−3. Período em andamento mostra aviso de valores parciais. Período = data de fechamento do negócio. Conteúdo, nesta ordem: KPIs (clientes cadastrados com compras concluídas em destaque, ganhos do período, negócios fechados — sem volume vendido), andamento dos clientes por expedição (compra concluída, em negociação, não contactados, cadastrados), cartões 3%/3%/5% com ganhos do período, tabela "Ganhos por expedição" com total.
- Extrato: saldo atual, total recebido, total gasto e lançamentos (data, tipo, descrição, origem, valor, saldo) com filtro Tudo/Entradas/Saídas. Mesmo padrão do Portal do Comissário.
- Expedições: em andamento/programadas; seção recolhida "Expedições finalizadas" (término já passou, UTC−3) com contagem e ganhos.
- Expedição: faixa compacta de indicadores; cadastro manual; importação; tabela de clientes (etapa, **responsável**, **negócio**, voo, hospedagem, seguro, seu ganho, **observação**). Com compra, o selo de voo/hospedagem/seguro abre um modal com os dados do HubSpot (trechos com horários e companhia; hotel; plano do seguro) e os comentários e arquivos que a Vay adicionou (o parceiro vê; só a Vay adiciona e apaga). Vendas atribuídas a clientes fora da lista aparecem só como uma linha-resumo com o ganho.

**Tabela de clientes com vários passageiros por negócio** (parceiro e Vay):
- **Uma linha por passageiro**, com a coluna **Negócio** mostrando o número (ou números, se estiver em mais de um negócio).
- **Valores e ganho aparecem uma única vez por negócio**, na **linha principal**: a do titular, se ele estiver cadastrado; senão, a do primeiro passageiro cadastrado (ordem de cadastro).
- As outras linhas do mesmo negócio mostram "Compra concluída · incluída no negócio #4512", sem valores e com ganho "—".
- Cliente que é linha principal em mais de um negócio: valores = soma desses negócios.
- Totais e KPIs somam **por negócio**, nunca por linha. Um negócio nunca entra duas vezes em total algum.
- Visão do parceiro: passageiros que ele não cadastrou **não aparecem por nome**. A linha principal mostra "+1 passageiro não cadastrado" (contagem, sem identidade).
- Visão Vay: passageiros não cadastrados aparecem como linhas próprias, com a tag "não cadastrado pelo parceiro".

Exemplo:

| Passageiro | Negócio | Voo | Hospedagem | Seguro | Ganho |
|---|---|---|---|---|---|
| Emerson | #4512 | R$ 8.000,00 | R$ 6.000,00 | R$ 600,00 | R$ 450,00 |
| Gislaine | #4512 | incluído no #4512 | | | — |

**Vay Agora**
- Visão geral: KPIs, expedições com pendências, resultado por parceiro, follow-ups pendentes, botão de sincronização.
- Expedições: todas, filtro por parceiro, badge de pendências, seção de finalizadas recolhida.
- Expedição: igual à do parceiro + tag HubSpot (novo/existente) por cliente + linhas de clientes fora da lista + linhas de passageiros não cadastrados + editor de follow-up + seção "Negócios do HubSpot".
- Parceiros: cards; clicar abre o mesmo painel do parceiro (com filtros) + "Ver expedições" + acordo de parceria (abrir, enviar outro PDF, voltar ao padrão) + extrato com "Adicionar lançamento" (entrada ou saída).
- Expedição (Vay): seção "Encontrados, mas não sinalizados no HubSpot": negócios ganhos com destino e data compatíveis, sem origem "Afiliado" e/ou sem a empresa da agência; não remuneram, dizem o que corrigir no HubSpot e destacam quando algum passageiro está na lista do parceiro.

Textos de apoio ficam em tooltips (ícone "i").

## 6. Integração HubSpot

- App privado com escopos de leitura: negócios, contatos e empresas. Mapeamento dos campos em `docs/HUBSPOT.md`.
- **Negócio de agência parceira:** etapa "Emissão Realizada" + "Origem do Negócio" = "Afiliado" + a agência associada como **Empresa** do negócio (nome igual ao do parceiro no sistema).
- **Não sinalizados:** a sincronização também lê os negócios ganhos com viagem perto das expedições; os que combinam por destino e data mas não estão sinalizados ficam visíveis só para a Vay (§5) e não remuneram até serem corrigidos no HubSpot.
- **Forma de pagamento:** campo "Forma de pagamento do cliente" (`forma_de_pagamento`); a opção "Crédito na VAY" indica abatimento de crédito.
- **Produto e valor:** campo "Serviço" (Aéreo → passagem, Hospedagem, Seguro Viagem; outros serviços não remuneram) e "Valor do negócio".
- **Roteiro:** trechos 1–6 (aeroporto de destino + data) no aéreo; cidade + check-in/out na hospedagem; destino + vigência no seguro. Aeroportos viram coordenadas pela tabela `src/lib/airports.ts`.
- **Passageiros:** para cada negócio, ler as associações negócio → contatos (API de associações v4), com os rótulos de associação, e buscar nome, e-mail e telefone dos contatos em lote. O rótulo "Titular" (nome configurável por variável de ambiente) define o titular. Mudança nas associações de um negócio já sincronizado atualiza os passageiros na próxima sincronização.
- **Etapas e observação dos clientes:** negócios em aberto e ganhos compatíveis com a expedição; campo do contato "Observações para parceiro".
- Falhas de API: novas tentativas com espera crescente; o erro é registrado e exibido à Vay.

## 7. Regras gerais

- Fuso de referência: America/Sao_Paulo (UTC−3) para "hoje", trimestres e expedições finalizadas.
- Moeda BRL, formato pt-BR. Comissão calculada sobre o valor de cada produto do negócio, **uma vez por negócio**, independentemente do número de passageiros. O cashback editado pela Vay substitui o calculado.
- **Fechamento por expedição** (não mais trimestral): ao finalizar a expedição, o crédito é lançado e congelado; alterações posteriores no HubSpot não reescrevem uma expedição finalizada. O filtro Ano/Trimestre do painel é só uma forma de ver os ganhos por data de fechamento do negócio, não um período de apuração.
- LGPD: aceite do termo de compartilhamento de dados no primeiro acesso do parceiro; log de acesso/alteração.
- Linguagem: "Vay Agora" sempre assim; tom do design system (você / a gente).

## 8. Fases e critérios de aceite

**Fase 1 — Base**
- Login com perfis; parceiro A não acessa nada do parceiro B (testado no banco).
- Criar expedição; cadastrar cliente manual e por planilha; duplicados bloqueados.
- Upsert no HubSpot com status novo/existente.

**Fase 2 — Negócios**
- Sincronização (agendada + manual) idempotente, incluindo passageiros (associações).
- Algoritmo de vínculo coberto por testes, incluindo: Lisboa 09 → Madrid 13 (vincula, aproximação), Barcelona → Madrid (vincula), Paris fora da janela (não vincula), duas expedições compatíveis (maior pontuação + sinalização), cliente fora da lista (remunera + sinalização).
- Testes de vários passageiros:
  - casal num negócio, os dois cadastrados → duas linhas, valores só na do titular, comissão contada uma vez;
  - casal num negócio, só o titular cadastrado → sem "fora da lista"; Vay vê o acompanhante como "não cadastrado"; parceiro vê "+1 passageiro não cadastrado";
  - titular não cadastrado, acompanhante cadastrado → sem "fora da lista"; valores na linha do acompanhante;
  - passageiro em dois negócios → coluna Negócio com os dois números; totais sem duplicidade;
  - negócio sem rótulo "Titular" → titular = contato mais antigo + sinalização.
- Conferência na tela da expedição com log de ajustes.
- RLS: parceiro não lê nome/e-mail/telefone de passageiros que não cadastrou (testado no banco).

**Fase 3 — Painéis e pagamento**
- Painel do parceiro com filtros; padrão = último trimestre concluído (UTC−3).
- Visão geral Vay, painel do parceiro na visão Vay.
- Fechamento por expedição (botão "Finalizar expedição", Vay) e exportação CSV das comissões por parceiro (uma linha por negócio, com a lista de passageiros).
