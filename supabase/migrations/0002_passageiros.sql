-- SPEC v1.1 · negócios com vários passageiros
-- Rode depois de 0001_init.sql (SQL Editor › New query › cole › Run, ou `npx supabase db push`).
--
-- O que muda:
-- 1. Nova tabela deal_passengers (negócio ↔ contato, muitos para muitos, com titular).
-- 2. Os dados de identidade saem de deals (contact_name, email) e vão para deal_passengers.
--    Assim o parceiro continua lendo o negócio (valores, roteiro), mas só lê nome/e-mail/telefone
--    dos passageiros que ele mesmo cadastrou.
-- 3. deals ganha: número exibido (#), contagem de passageiros e se o rótulo "Titular" veio do HubSpot.
-- 4. clients ganha o ID do contato no HubSpot (usado na correspondência cliente ↔ passageiro).
-- 5. sync_runs: histórico da sincronização com o HubSpot (só a Vay vê).

-- ---------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------

alter table public.clients add column hubspot_contact_id text;
create index clients_hubspot_contact_idx on public.clients (hubspot_contact_id) where hubspot_contact_id is not null;

-- ---------------------------------------------------------------
-- deals
-- ---------------------------------------------------------------

-- Número exibido para negócios lançados à mão (os do HubSpot usam hubspot_id).
alter table public.deals add column seq bigint generated always as identity;
-- Mantida por gatilho a partir de deal_passengers: o parceiro vê a contagem, não a identidade.
alter table public.deals add column passenger_count int not null default 0;
-- false quando nenhum contato do negócio tem o rótulo "Titular" no HubSpot.
alter table public.deals add column titular_labeled boolean not null default true;
alter table public.deals add column updated_at timestamptz not null default now();

-- ---------------------------------------------------------------
-- deal_passengers
-- ---------------------------------------------------------------

create table public.deal_passengers (
  id                 uuid primary key default gen_random_uuid(),
  deal_id            uuid not null references public.deals (id) on delete cascade,
  hubspot_contact_id text,
  name               text not null,
  email              text not null default '',
  phone              text not null default '',
  is_titular         boolean not null default false,
  -- Primeira vez que a associação foi vista (define o titular quando não há rótulo).
  first_seen_at      timestamptz not null default now(),
  position           int not null default 0,
  created_at         timestamptz not null default now()
);
create index deal_passengers_deal_idx on public.deal_passengers (deal_id);
-- Um contato aparece uma vez por negócio (passageiros lançados à mão, sem ID, ficam livres).
alter table public.deal_passengers add constraint deal_passengers_contact_uniq unique (deal_id, hubspot_contact_id);
-- Exatamente um titular por negócio (no máximo um no banco; o sync e o lançamento manual garantem um).
create unique index deal_passengers_one_titular on public.deal_passengers (deal_id) where is_titular;

-- Copia o contato único de cada negócio existente como titular.
insert into public.deal_passengers (deal_id, name, email, is_titular, position)
select id, contact_name, lower(email), true, 0 from public.deals;

alter table public.deals drop column contact_name;
alter table public.deals drop column email;

create or replace function public.refresh_passenger_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d uuid := coalesce(new.deal_id, old.deal_id);
begin
  update deals set passenger_count = (select count(*) from deal_passengers where deal_id = d)
  where id = d;
  if tg_op = 'UPDATE' and old.deal_id is distinct from new.deal_id then
    update deals set passenger_count = (select count(*) from deal_passengers where deal_id = old.deal_id)
    where id = old.deal_id;
  end if;
  return null;
end;
$$;

create trigger deal_passengers_count
  after insert or update or delete on public.deal_passengers
  for each row execute function public.refresh_passenger_count();

update public.deals d set passenger_count = (select count(*) from public.deal_passengers p where p.deal_id = d.id);

-- ---------------------------------------------------------------
-- Correspondência cliente ↔ passageiro (SPEC §3)
-- Mesmo ID de contato no HubSpot; sem ID, mesmo e-mail; sem e-mail, mesmo telefone (só dígitos, últimos 11).
-- Mesma regra de src/lib/matching.ts (samePerson).
-- ---------------------------------------------------------------

create or replace function public.phone_key(p text) returns text
language sql immutable as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 11);
$$;

create or replace function public.same_person(
  c_contact text, c_email text, c_phone text,
  p_contact text, p_email text, p_phone text
) returns boolean
language sql immutable as $$
  select case
    when coalesce(c_contact, '') <> '' and coalesce(p_contact, '') <> '' then c_contact = p_contact
    when coalesce(trim(c_email), '') <> '' and coalesce(trim(p_email), '') <> ''
      then lower(trim(c_email)) = lower(trim(p_email))
    when phone_key(c_phone) <> '' and phone_key(p_phone) <> '' then phone_key(c_phone) = phone_key(p_phone)
    else false
  end;
$$;

-- O passageiro foi cadastrado pelo parceiro do usuário (em qualquer expedição dele)
-- e o negócio é do afiliado desse parceiro?
create or replace function public.passenger_visible_to_partner(p public.deal_passengers) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from deals d
    join expeditions e on e.partner_id = my_partner_id()
    join clients c on c.expedition_id = e.id
    where d.id = p.deal_id
      and d.afiliado = my_afiliado()
      and same_person(c.hubspot_contact_id, c.email, c.phone, p.hubspot_contact_id, p.email, p.phone)
  );
$$;

-- ---------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------

alter table public.deal_passengers enable row level security;

create policy deal_passengers_select on public.deal_passengers for select
  using (is_vay() or passenger_visible_to_partner(deal_passengers));
create policy deal_passengers_write on public.deal_passengers for all
  using (is_vay()) with check (is_vay());

-- ---------------------------------------------------------------
-- Histórico da sincronização com o HubSpot
-- ---------------------------------------------------------------

create table public.sync_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  deals       int not null default 0,
  error       text
);

alter table public.sync_runs enable row level security;
create policy sync_runs_vay on public.sync_runs for all
  using (is_vay()) with check (is_vay());
