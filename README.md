# Vay Agora · Agências parceiras

Portal em que agências parceiras criam expedições, cadastram clientes e acompanham as comissões sobre as vendas da Vay Agora. A equipe Vay acompanha todos os parceiros, registra follow-ups e confere os negócios.

O protótipo original está no claude.ai: *Vay Agora — Expedições com parceiros*.

## Como funciona

| Quem | O que vê e faz |
|---|---|
| **Agência parceira** | Painel com ganhos por trimestre, cria expedições, cadastra clientes (um a um ou por planilha CSV/colada do Excel) e acompanha a etapa de cada cliente. Só vê os próprios dados. |
| **Equipe Vay Agora** | Visão geral de todos os parceiros, follow-ups pendentes, atualização de etapa e nota de cada cliente, conciliação dos negócios fechados, cadastro de parceiros e convites de acesso. |

**Comissões:** Voo 2% · Hospedagem 3% · Seguro viagem 5%, sobre os negócios fechados com o *afiliado* do parceiro.

**Vínculo automático negócio → expedição:** mesmo afiliado + viagem entre 7 dias antes e 3 dias depois da expedição + cidade da expedição em algum trecho (ou uma cidade a até 700 km). Casos aproximados, com mais de uma expedição possível, ou de clientes fora da lista do parceiro aparecem para conferência manual na tela da expedição.

## Tecnologia

- **Next.js 15** (App Router, Server Actions): o site.
- **Supabase**: login e banco de dados Postgres, com regras de acesso (RLS) que garantem que cada parceiro só enxergue os próprios dados.
- **Vercel**: hospedagem; o sistema fica acessível de qualquer computador ou celular.

## Colocando no ar (uma vez só)

### 1. Supabase (banco e login)

1. Crie uma conta em <https://supabase.com> e um projeto novo (região *South America (São Paulo)*).
2. Em **SQL Editor › New query**, cole o conteúdo de `supabase/migrations/0001_init.sql` e clique em **Run**. Depois, numa nova query, faça o mesmo com `supabase/migrations/0002_passageiros.sql`.
3. *(Opcional, para testar)* Rode também `supabase/seed_demo.sql`. Ele cria os 3 parceiros, as 6 expedições e os clientes do protótipo.
4. Em **Authentication › Sign In / Providers**, desligue **Allow new users to sign up**. O acesso é só por convite.
5. Em **Authentication › Emails**, troque o link dos modelos:
   - **Invite user**: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/definir-senha`
   - **Reset password**: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/definir-senha`
6. Em **Project Settings › API**, copie a *Project URL*, a chave *anon public* e a chave *service_role*.

### 2. Vercel (hospedagem)

1. Em <https://vercel.com>, entre com o GitHub e importe o repositório `zaidan-hub/vayagenciasparceiras`.
2. Em **Environment Variables**, preencha as variáveis de `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL`: o endereço final (ex.: `https://vayagenciasparceiras.vercel.app`)
   - HubSpot (quando for ligar a sincronização): `HUBSPOT_TOKEN` e, se os nomes internos forem diferentes, as variáveis `HUBSPOT_PROP_*`. `CRON_SECRET` para a sincronização agendada.
3. Clique em **Deploy**.
4. De volta ao Supabase, em **Authentication › URL Configuration**, coloque esse mesmo endereço em **Site URL**.

### 3. Primeiro acesso da equipe Vay

1. No Supabase, em **Authentication › Users › Add user › Create new user**, crie o seu usuário com e-mail e senha.
2. No **SQL Editor**, rode:
   ```sql
   update profiles set role = 'vay' where email = 'seu-email@vayagora.com.br';
   ```
3. Entre no sistema. Daí em diante, parceiros e colegas são convidados pela tela **Parceiros**.

> Para ligar um usuário de teste a um parceiro de demonstração:
> `update profiles set partner_id = '00000000-0000-0000-0000-000000000001' where email = '...';` (Horizonte Eventos)

## Rodando no computador (desenvolvimento)

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do Supabase
npm run dev                  # http://localhost:3000
npm test                     # testes (os de acesso ao banco sobem um Postgres local, se houver)
```

## Estrutura

```
supabase/migrations/   esquema do banco + regras de acesso
supabase/seed_demo.sql dados de demonstração
docs/SPEC.md           especificação (fonte da verdade das regras)
src/lib/commission.ts  taxas e etapas
src/lib/matching.ts    vínculo negócio → expedição e cliente ↔ passageiro
src/lib/ledger.ts      totais por expedição e linhas da tabela de clientes (soma por negócio)
src/lib/hubspot.ts     cliente da API do HubSpot · src/lib/sync.ts sincronização
src/lib/cities.ts      destinos disponíveis (com coordenadas para a regra de raio)
src/app/(app)/         telas após o login (painel, expedições, parceiros, visão geral)
src/app/(app)/actions.ts  todas as gravações (criar expedição, clientes, follow-up, convites…)
```

## Próximas fases

- **Fase 2 · HubSpot:** sincronizar automaticamente os negócios fechados com o campo *afiliado* (hoje a equipe Vay pode registrá-los à mão na tela da expedição) e criar/encontrar o contato no HubSpot quando o parceiro cadastra um cliente.
- Destinos fora da lista: busca de cidades com geocodificação.
