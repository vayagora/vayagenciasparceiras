-- SPEC 2.0: o sistema passa a ser só visualização. Todo lançamento é feito no HubSpot.
-- - A lista de clientes de cada expedição vem dos passageiros dos negócios da agência no HubSpot
--   (qualquer etapa), cruzados por destino e data. A lista cadastrada no sistema deixa de existir.
-- - A etapa do cliente vem da etapa do negócio.
-- - Os créditos só são liberados quando a Vay finaliza a expedição (fechamento lançado no extrato).

-- ---------------------------------------------------------------- Negócios em qualquer etapa
alter table public.deals add column hs_stage text not null default '';
-- won = Emissão Realizada; open = etapas antes da compra; lost = Negócio perdido
alter table public.deals add column stage_kind text not null default 'won' check (stage_kind in ('won', 'open', 'lost'));
-- "Observações para parceiro" do negócio no HubSpot
alter table public.deals add column partner_note text not null default '';
-- Negócio em aberto ainda não tem data de fechamento
alter table public.deals alter column closed_on drop not null;

-- ---------------------------------------------------------------- Passageiros
-- O parceiro vê todos os passageiros dos negócios da própria agência (não há mais lista cadastrada).
create or replace function public.passenger_visible_to_partner(p public.deal_passengers) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from deals d
    where d.id = p.deal_id and d.signaled and d.afiliado = my_afiliado()
  );
$$;

-- ---------------------------------------------------------------- Lista e comentários do sistema
-- Decisão do gestor: apagar os clientes cadastrados/importados e os comentários.
drop table public.client_comments;
drop table public.clients;

-- ---------------------------------------------------------------- Expedições: só a Vay cria e altera
drop policy expeditions_insert on public.expeditions;
create policy expeditions_insert on public.expeditions for insert with check (is_vay());
drop policy expeditions_update on public.expeditions;
create policy expeditions_update on public.expeditions for update using (is_vay()) with check (is_vay());

-- Fechamento: a Vay confirma que a expedição aconteceu e os créditos são lançados no extrato.
alter table public.expeditions add column finished_at timestamptz;
alter table public.expeditions add column finished_by uuid references auth.users (id) on delete set null;
alter table public.expeditions add column finished_by_name text not null default '';

-- Lançamento do fechamento no extrato (um por expedição; período fechado nunca é reescrito)
alter table public.balance_entries add column expedition_id uuid references public.expeditions (id) on delete restrict;
create unique index balance_entries_expedition_key on public.balance_entries (expedition_id) where expedition_id is not null;
