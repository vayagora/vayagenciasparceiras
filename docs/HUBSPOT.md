# Integração com o HubSpot da Vay Agora

Como a sincronização (`src/lib/sync.ts`, `src/lib/hubspot.ts`) lê os negócios da conta da Vay Agora (portal 44656712).

## Quais negócios entram

- Etapa do funil em `HUBSPOT_WON_STAGES` (padrão `135525686` = "Emissão Realizada").
- Campo da agência parceira (`HUBSPOT_PROP_AFILIADO`, padrão `agencia_parceira`) preenchido.
  A opção escolhida precisa ser **exatamente** o nome do parceiro no sistema (ex.: "JT Viajar e Correr").
- **Pendente no HubSpot:** esse campo ainda não existe. Proposta: "Origem do Negócio" = "Agências Parceiras"
  e uma lista suspensa "Agência Parceira" com as agências.

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

## Passageiros

Contatos associados ao negócio; o rótulo de associação "Titular" (`HUBSPOT_TITULAR_LABEL`) marca o titular.
**Pendente no HubSpot:** criar esse rótulo (Configurações › Objetos › Negócios › Associações).

## App privado

Escopos: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`,
`crm.schemas.deals.write`. O token vai em `HUBSPOT_TOKEN` (Vercel › Settings › Environment Variables).
