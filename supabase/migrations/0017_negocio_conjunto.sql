-- SPEC 2.4: negócio conjunto (vários passageiros) e pendências por passageiro.
-- - Negócio da agência (origem + empresa) com UM passageiro vai direto para "Passageiros".
-- - Negócio da agência com VÁRIOS passageiros vai para "A conferir"; a Vay pode "Marcar como passageiros" (o negócio
--   inteiro). A aprovação vale para os passageiros daquele momento: se entrar ou sair alguém, volta para "A conferir".
-- - Acompanhante que não viaja nunca se resolve no sistema: separa-se o negócio no HubSpot.
-- - Passageiro com qualquer pendência na expedição fica inteiro em "A conferir" (e quem está no mesmo negócio vai junto).
-- - O parceiro vê só os nomes dos passageiros pendentes dos negócios da própria agência ("Pendências de lançamento").

-- O parceiro vê os negócios sinalizados da própria agência; quais vão para a lista é calculado pelo sistema
drop policy deals_select on public.deals;
create policy deals_select on public.deals for select
  using (is_vay() or (signaled and afiliado = my_afiliado()));

create or replace function public.deal_visible_to_partner(d_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from deals d where d.id = d_id and d.signaled and d.afiliado = my_afiliado());
$$;

create or replace function public.passenger_visible_to_partner(p public.deal_passengers) returns boolean
language sql stable security definer set search_path = public as $$
  select public.deal_visible_to_partner(p.deal_id);
$$;

create or replace function public.deal_folder_visible_to_partner(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from deals d where d.id::text = folder and d.signaled and d.afiliado = my_afiliado());
$$;

-- A função das pendências (0015) é substituída pela tabela abaixo
drop function public.partner_pending_names(uuid);

-- Aprovação de negócio conjunto pela Vay ("Marcar como passageiros"), com os passageiros daquele momento
create table public.expedition_approvals (
  id               uuid primary key default gen_random_uuid(),
  expedition_id    uuid not null references public.expeditions (id) on delete cascade,
  deal_id          uuid not null references public.deals (id) on delete cascade,
  passenger_keys   text[] not null,
  approved_by      uuid references auth.users (id) on delete set null,
  approved_by_name text not null default '',
  approved_at      timestamptz not null default now(),
  unique (expedition_id, deal_id)
);
alter table public.expedition_approvals enable row level security;
create policy expedition_approvals_select on public.expedition_approvals for select
  using (is_vay() or exists (select 1 from expeditions e where e.id = expedition_id and e.partner_id = my_partner_id()));
create policy expedition_approvals_write on public.expedition_approvals for all
  using (is_vay()) with check (is_vay());

-- Passageiros pendentes de negócios da agência em cada expedição (calculado pelo sistema a cada sincronização e a cada
-- marcação da Vay). Só nomes de passageiros de negócios da própria agência: o parceiro lê os das próprias expedições.
create table public.expedition_pending (
  expedition_id uuid not null references public.expeditions (id) on delete cascade,
  person_key    text not null,
  person_name   text not null default '',
  primary key (expedition_id, person_key)
);
alter table public.expedition_pending enable row level security;
create policy expedition_pending_select on public.expedition_pending for select
  using (is_vay() or exists (select 1 from expeditions e where e.id = expedition_id and e.partner_id = my_partner_id()));
create policy expedition_pending_write on public.expedition_pending for all
  using (is_vay()) with check (is_vay());
