# Integração com o HubSpot da Vay Agora

Como a sincronização (`src/lib/sync.ts`, `src/lib/hubspot.ts`) lê os negócios da conta da Vay Agora (portal 44656712).

## Quais negócios entram

- Etapa do funil em `HUBSPOT_WON_STAGES` (padrão `135525686` = "Emissão Realizada").
- **Origem do Negócio** = "Afiliado" (`HUBSPOT_ORIGEM_PROP` / `HUBSPOT_ORIGEM_VALUE`).
- A **agência é a Empresa associada ao negócio**. O nome da empresa no HubSpot precisa ser igual ao nome
  (afiliado) do parceiro no sistema, ignorando acentos e maiúsculas (ex.: "JT Viajar e Correr").
  Se houver várias empresas associadas, vale a que é parceira. Empresa que não é parceira → o negócio entra
  sinalizado; sem empresa associada → ignorado (aparece no resultado da sincronização).

## Negócios não sinalizados

Como os consultores podem esquecer a marcação, a sincronização também busca **todos os negócios ganhos** com
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
| Passagem Aérea (rótulo "Aéreo") | voo | 2% |
| Hospedagem | hospedagem | 3% |
| Seguro Viagem | seguro | 5% |
| Outros (Pacote, Transfer, Passeio…) | — | não entram (aparecem como ignorados na sincronização) |

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

## Etapa do cliente e observação

A cada sincronização, cada cliente cadastrado é ligado ao contato do HubSpot (por e-mail; sem e-mail, por
telefone, buscando em Telefone, Celular e WhatsApp) e recebe:

- **Etapa**: negócio **ganho** compatível com a expedição (destino e data) em que o cliente é passageiro →
  "Compra concluída"; negócio **em aberto** (`HUBSPOT_OPEN_STAGES`, padrão: todas as etapas antes de
  "Emissão Realizada", menos "Negócio perdido") → "Em negociação"; nenhum → "Não contactado". A Vay pode
  marcar à mão "Não contactar" ou "Comprou em outro lugar"; compra concluída sempre prevalece.
- **Observação**: o campo do contato **"Observações para parceiro"** (`HUBSPOT_PROP_OBS_PARCEIRO`, padrão
  `observacoes_para_parceiro`). **Pendente no HubSpot:** criar esse campo (texto de várias linhas) no Contato.
  O parceiro vê o que estiver escrito ali.

## Detalhes no modal (voo, hospedagem, seguro)

Guardados em `deals.details` na sincronização: trechos (origem, destino, data, horários, companhia), hotel
(nome, cidade, check-in/out, quartos, alimentação) e seguro (plano, tipo, destino, vigência, cobertura).
O código de reserva não é copiado (fica só no HubSpot).

## Passageiros

Contatos associados ao negócio; o rótulo de associação "Titular" (`HUBSPOT_TITULAR_LABEL`) marca o titular.
**Pendente no HubSpot:** criar esse rótulo (Configurações › Objetos › Negócios › Associações).

## App privado

Escopos: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`, `crm.objects.companies.read`,
`crm.schemas.deals.write`. O token vai em `HUBSPOT_TOKEN` (Vercel › Settings › Environment Variables).
