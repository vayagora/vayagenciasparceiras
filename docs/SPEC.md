# Sistema de Empresas Parceiras — Especificação técnica

Versão 1.1 · baseada no protótipo aprovado (canvas "Vay Agora — Expedições com parceiros")

**Mudanças na 1.1:** negócios com vários passageiros (ex.: casal em um único negócio). Uma linha por passageiro, com o número do negócio; valores e comissão contados uma vez por negócio. Afeta §3, §4.2, §4.3, §4.4, §5, §6 e §8.

## 1. Objetivo

Empresas parceiras da Vay Agora organizam **expedições** (viagens em grupo: congressos, feiras, intercâmbios) e indicam **clientes**. A Vay Agora faz a venda (voo, hospedagem, seguro) pelo HubSpot. O parceiro é remunerado por comissão sobre os negócios vinculados às suas expedições.

| Produto | Comissão do parceiro |
|---|---|
| Voo | 2% |
| Hospedagem | 3% |
| Seguro viagem | 5% |

A comissão é calculada sobre o **valor do negócio**, não por passageiro. Um negócio com dois passageiros gera uma única comissão sobre o valor total.

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
- **Fechamento de período**: trimestre, parceiro, valores congelados.

Etapas de follow-up: Aguardando contato · Em contato · Proposta enviada · Compra concluída · Desistiu. Se o cliente é **passageiro** de um negócio vinculado à expedição (titular ou não), a etapa exibida é "Compra concluída".

**Correspondência cliente ↔ passageiro:** mesmo ID de contato no HubSpot; sem ID, mesmo e-mail; sem e-mail, mesmo telefone normalizado (só dígitos, últimos 11).

## 4. Fluxos

### 4.1 Parceiro inicia expedição
Campos: nome, destino (cidade geocodificada), data de início, duração (dias). Todos obrigatórios. Após criar, abre a tela da expedição com o cadastro de clientes aberto.

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
| Pelo menos um passageiro está na lista, mas outros não | vincula e **remunera** | Passageiro não cadastrado (informativa, não gera pendência) |
| Negócio sem rótulo "Titular" em nenhum contato | vincula normalmente | Titular não definido |
| Nenhuma compatível | não vincula, **não remunera** | Nenhuma expedição encontrada |

Basta **um** passageiro do negócio estar na lista para o negócio contar como "na lista" (ex.: titular Emerson não cadastrado, Gislaine cadastrada → não é "fora da lista").

O motivo é gravado em texto, ex.: "Roteiro Lisboa (09/11) → Madrid (13/11): Madrid está no roteiro; a viagem começa 4 dias antes da expedição (13/11)."

Negócios fechados fora de expedições não geram remuneração.

### 4.5 Conferência (na tela da expedição, perfil Vay)
Seção "Negócios do HubSpot" na tela de cada expedição:
- negócios vinculados à expedição + negócios do mesmo parceiro sem expedição;
- por negócio: número, passageiros (titular destacado; os não cadastrados marcados), roteiro, datas, valores, comissão, motivo (tooltip), sinalizações;
- ações: trocar expedição (automática / outra expedição do parceiro / sem expedição), "Vincular a esta expedição", "Marcar como conferido" / desfazer;
- todo ajuste manual fica registrado (quem, quando, de → para).

Pendências (sinalizados e não conferidos) aparecem: no card da expedição, na Visão geral (lista de expedições com pendência). A sinalização "Passageiro não cadastrado" não conta como pendência.

### 4.6 Follow-up (perfil Vay)
Por cliente: etapa e nota. Salvar grava a data (fuso America/Sao_Paulo). Compras e valores não são editados aqui: vêm do HubSpot.

## 5. Telas

**Parceiro**
- Painel: filtro Ano + Trimestre (jan–mar, abr–jun, jul–set, out–dez, ou ano inteiro). Padrão: último trimestre concluído em UTC−3. Período em andamento mostra aviso de valores parciais. Período = data de fechamento do negócio. Conteúdo: KPIs (ganhos, volume vendido, negócios fechados, clientes cadastrados), cartões 2%/3%/5% com ganhos do período, tabela "Ganhos por expedição" com total.
- Expedições: em andamento/programadas; seção recolhida "Expedições finalizadas" (término já passou, UTC−3) com contagem e ganhos.
- Expedição: faixa compacta de indicadores; cadastro manual; importação; tabela de clientes (etapa, **negócio**, voo, hospedagem, seguro, seu ganho, último follow-up). Vendas atribuídas a clientes fora da lista aparecem só como uma linha-resumo com o ganho.

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
| Emerson | #4512 | R$ 8.000,00 | R$ 6.000,00 | R$ 600,00 | R$ 370,00 |
| Gislaine | #4512 | incluído no #4512 | | | — |

**Vay Agora**
- Visão geral: KPIs, expedições com pendências, resultado por parceiro, follow-ups pendentes, botão de sincronização.
- Expedições: todas, filtro por parceiro, badge de pendências, seção de finalizadas recolhida.
- Expedição: igual à do parceiro + tag HubSpot (novo/existente) por cliente + linhas de clientes fora da lista + linhas de passageiros não cadastrados + editor de follow-up + seção "Negócios do HubSpot".
- Parceiros: cards; clicar abre o mesmo painel do parceiro (com filtros) + "Ver expedições".

Textos de apoio ficam em tooltips (ícone "i").

## 6. Integração HubSpot

- App privado com escopos: contatos (leitura/escrita), negócios (leitura), esquemas/propriedades de negócios (escrita, para manter as opções do "afiliado").
- Contatos: busca/criação em lote por e-mail (upsert com `idProperty=email`).
- Negócios: busca por estágio "ganho" + "afiliado" preenchido + modificados desde a última sincronização.
- **Passageiros:** para cada negócio, ler as associações negócio → contatos (API de associações v4), com os rótulos de associação, e buscar nome, e-mail e telefone dos contatos em lote. O rótulo "Titular" (nome configurável por variável de ambiente) define o titular. Mudança nas associações de um negócio já sincronizado atualiza os passageiros na próxima sincronização.
- Propriedades necessárias no negócio (nomes internos configuráveis por variável de ambiente): afiliado (dropdown), data de ida, data de volta, roteiro (trechos cidade+data — formato a definir, ex. JSON ou texto `Cidade|AAAA-MM-DD;...`), valor voo, valor hospedagem, valor seguro (ou itens de linha por categoria).
- Cidades do roteiro são geocodificadas e guardadas em cache.
- Falhas de API: novas tentativas com espera crescente; o erro é registrado e exibido à Vay.

## 7. Regras gerais

- Fuso de referência: America/Sao_Paulo (UTC−3) para "hoje", trimestres e expedições finalizadas.
- Moeda BRL, formato pt-BR. Comissão calculada sobre o valor de cada produto do negócio, **uma vez por negócio**, independentemente do número de passageiros.
- Fechamento trimestral congela valores; alterações posteriores no HubSpot geram ajuste no período seguinte, nunca reescrevem período fechado.
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
- Fechamento trimestral e exportação CSV das comissões por parceiro (uma linha por negócio, com a lista de passageiros).
