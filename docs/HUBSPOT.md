# Integração com o HubSpot da Vay Agora

Como a sincronização (`src/lib/sync.ts`, `src/lib/hubspot.ts`) lê os negócios da conta da Vay Agora (portal 44656712).

## Quais negócios entram (SPEC 2.0)

- **Qualquer etapa** do funil: em aberto (`HUBSPOT_OPEN_STAGES`), ganho (`HUBSPOT_WON_STAGES`, padrão `135525686` = "Emissão Realizada")
  e perdido (`HUBSPOT_LOST_STAGES`, padrão `closedlost`). Só o ganho remunera; os outros dão a etapa do cliente.
- **Origem do Negócio** = "Agência parceira" ("Afiliado", o método antigo, não conta: o negócio vai para "A conferir" se combinar com uma expedição) (`HUBSPOT_ORIGEM_PROP` / `HUBSPOT_ORIGEM_VALUE`, lista separada por vírgula;
  ignora acentos e maiúsculas).
- A **agência é a Empresa associada ao negócio**. O nome da empresa no HubSpot precisa ser igual ao nome
  (afiliado) do parceiro no sistema, ignorando acentos e maiúsculas (ex.: "JT Viajar e Correr").
  Se houver várias empresas associadas, vale a que é parceira. Empresa que não é parceira → o negócio entra
  sinalizado; sem empresa associada → ignorado (aparece no resultado da sincronização).

## Negócios não sinalizados

Como os consultores podem esquecer a marcação, a sincronização também busca **todos os negócios ganhos ou em aberto** com
viagem perto das expedições (1º trecho aéreo, check-in ou início do seguro entre 30 dias antes da primeira
expedição e 3 dias depois da última). Os que não estão sinalizados (origem ≠ Afiliado e/ou sem a empresa da
agência) e combinam com alguma expedição por destino e data (mesma regra do vínculo) são guardados como
**"Encontrado, mas não sinalizado no HubSpot"**:

- aparecem só para a Vay, na tela da expedição (seção própria) e como pendência;
- **não remuneram** e não entram em nenhum total; mostram a comissão que gerariam;
- dizem o que corrigir no HubSpot e têm link para o negócio (`HUBSPOT_PORTAL_ID`, padrão 44656712);
- destacam quando algum passageiro está na lista do parceiro (contato, e-mail, telefone ou nome completo);
- se a empresa da agência já está associada, só as expedições desse parceiro são consideradas.

Corrigido no HubSpot, o negócio passa a sinalizado na próxima sincronização. Os que deixam de combinar saem
da lista. O parceiro nunca vê esses negócios (RLS, migração 0003).

## Produto e valor

Cada negócio vende um serviço (campo **Serviço**, `servico`). O valor é o **Valor do negócio** (`amount`).

| Serviço | Produto no sistema | Comissão |
|---|---|---|
| Passagem Aérea (rótulo "Aéreo") | voo | 3% |
| Hospedagem | hospedagem | 3% |
| Seguro Viagem | seguro | 5% |
| Outros (Pacote, Transfer, Passeio…) | — | não entram (aparecem como ignorados na sincronização) |

## Forma de pagamento

Campo **"Forma de pagamento do cliente"** (`forma_de_pagamento`; várias opções vêm separadas por `;`):

- só "Crédito na VAY" → o negócio entra, mas sem cashback;
- "Crédito na VAY" + outra forma → pagamento misto: cashback a definir pela Vay (pendência);
- qualquer outra forma, ou vazio → cashback normal.

## Roteiro (destino + datas)

| Serviço | Destino | Datas |
|---|---|---|
| Aéreo | "Destino - Trecho 1…6" (aeroportos) | "Data - Trecho 1…6"; volta = data do último trecho |
| Hospedagem | "Cidade [Carro/Hosped/…]" (`cidade__hotel_`) | check-in / check-out |
| Seguro | "Destino [Seguro]" (`destino__seguro_`) | início / fim da vigência |

Nomes internos dos trechos (alguns não batem com o rótulo; vale o rótulo):

| Trecho | Destino | Data |
|---|---|---|
| 1 | `aeroporto_de_partida` | `data_da_volta_` |
| 2 | `aeroporto_de_chegada___trecho_2` | `data_de_chegada___trecho_2` |
| 3 | `destino___trecho_3` | `data_da_ida_` |
| 4 | `destino___trecho_4` | `data_da_partida___trecho_2` |
| 5 | `destino___trecho_5` | `data___trecho_5` |
| 6 | `destino___trecho_6` | `data___trecho_6` |

Aeroportos viram cidade + coordenadas pela tabela `src/lib/airports.ts` (gerada a partir das opções do HubSpot
e da base OpenFlights). Aeroporto a até 60 km de uma cidade da lista de destinos vira essa cidade
(GRU → São Paulo), para o vínculo exato funcionar. 93 aeroportos pequenos não têm coordenada e só casam pelo nome.

Limitação: no seguro e na hospedagem, o destino é texto livre. Se estiver escrito como país ("Tailândia"),
não casa com a cidade da expedição.

## Um passageiro por negócio (SPEC 2.1)

Só negócios da agência com **um** passageiro entram direto na lista da expedição. Negócio com vários passageiros vai para
"A conferir": separe no HubSpot em um negócio por passageiro e sincronize.

## Etapa do cliente e observação (SPEC 2.0)

A lista de clientes de cada expedição são os passageiros dos negócios da agência que combinam com ela. A etapa vem da
etapa do negócio: Pré Cotação / Realizar Cotação → Em contato; demais etapas em aberto → Em negociação; Emissão Realizada →
Compra concluída; Negócio perdido → Não comprou. A observação é o campo **"Observações para parceiro"**
(`observacoes_para_parceiro`, no **Negócio**; `HUBSPOT_PROP_OBS_PARCEIRO`), guardado em `deals.partner_note`.

Negócio em aberto sem Serviço ou Valor entra com o roteiro (valor zero) para aparecer na lista.

## Detalhes no modal (voo, hospedagem, seguro)

Guardados em `deals.details` na sincronização: trechos (origem, destino, data, horários, companhia), hotel
(nome, cidade, check-in/out, quartos, alimentação) e seguro (plano, tipo, destino, vigência, cobertura).
O código de reserva não é copiado (fica só no HubSpot).

## Passageiros

Contatos associados ao negócio, com os rótulos de associação da conta:

- **"Comprador"** (`HUBSPOT_BUYER_LABEL`): quem pagou. Também marca o titular (`HUBSPOT_TITULAR_LABEL`, padrão `Titular,Comprador`;
  entre vários, vale o que também é passageiro). Negócio com um contato só não precisa de rótulo.
- **"Passageiro"** (`HUBSPOT_PASSENGER_LABEL`): quem viaja. Só eles entram na lista de clientes da expedição.
  Sem nenhum rótulo de passageiro no negócio, todos os contatos contam como passageiros.

## Créditos da agência (SPEC 2.3)

| Uso | Onde | Propriedade |
|---|---|---|
| Saldo atual | Empresa (`companies`) | `creditos_abertos` ("Créditos abertos") |
| Lançamentos do extrato | Objeto Créditos (`0-410`, Course renomeado) associado à empresa | `hs_course_name` (lançamento), `tipo_de_movimentacao` (Acúmulo/Uso), `motivo_do_credito`, `valor_total_do_credito` ([ACÚMULO]), `valor_utilizado` ([USO]), `hs_createdate` (data) |

A empresa é achada pelo nome igual ao do parceiro (afiliado), ignorando acentos e maiúsculas.
Escopo extra necessário: `crm.objects.courses.read` (no sistema de comissários, funcionou com **Service Key**).

## App privado

Escopos (só leitura): `crm.objects.deals.read`, `crm.objects.contacts.read`, `crm.objects.companies.read` e `crm.objects.courses.read` (créditos). O token vai em `HUBSPOT_TOKEN` (Vercel › Settings › Environment Variables).
