-- SPEC 2.1: abas Passageiros / A conferir / Conferidos em cada expedição.
-- - "Passageiros" só é preenchido pela sincronização: negócio da agência (origem + empresa associada)
--   com UM passageiro, vinculado à expedição por destino e data.
-- - Negócio da agência com mais de um passageiro, ou negócio não sinalizado que combina com a expedição,
--   vai para "A conferir". A Vay só pode marcar o passageiro como "Conferido" (ou voltar para "A conferir");
--   para ir a "Passageiros", corrige no HubSpot (ex.: um passageiro por negócio).
-- - A marcação vale para a pessoa naquela expedição: na próxima sincronização ela não volta para "A conferir".

create table public.expedition_reviews (
  id               uuid primary key default gen_random_uuid(),
  expedition_id    uuid not null references public.expeditions (id) on delete cascade,
  -- Pessoa: "c:<id do contato no HubSpot>" ou "n:<nome normalizado>" (mesma chave da lista)
  person_key       text not null check (length(person_key) > 2),
  person_name      text not null default '',
  reviewed_by      uuid references auth.users (id) on delete set null,
  reviewed_by_name text not null default '',
  reviewed_at      timestamptz not null default now(),
  unique (expedition_id, person_key)
);

-- Conferência é da Vay: o parceiro não vê nem grava
alter table public.expedition_reviews enable row level security;
create policy expedition_reviews_vay on public.expedition_reviews for all
  using (is_vay()) with check (is_vay());

-- O parceiro só vê os negócios que vão para a lista dele: sinalizados, da própria agência e com um passageiro.
-- Negócio com vários passageiros fica só com a Vay (A conferir) até ser separado no HubSpot.
drop policy deals_select on public.deals;
create policy deals_select on public.deals for select
  using (is_vay() or (signaled and afiliado = my_afiliado() and passenger_count = 1));

create or replace function public.deal_visible_to_partner(d_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from deals d
    where d.id = d_id and d.signaled and d.afiliado = my_afiliado() and d.passenger_count = 1
  );
$$;

create or replace function public.passenger_visible_to_partner(p public.deal_passengers) returns boolean
language sql stable security definer set search_path = public as $$
  select public.deal_visible_to_partner(p.deal_id);
$$;

create or replace function public.deal_folder_visible_to_partner(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from deals d
    where d.id::text = folder and d.signaled and d.afiliado = my_afiliado() and d.passenger_count = 1
  );
$$;
