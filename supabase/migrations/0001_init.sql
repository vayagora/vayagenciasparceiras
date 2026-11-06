-- Vay Agora · Expedições com parceiros — esquema inicial
-- Rode no Supabase: SQL Editor › New query › cole este arquivo › Run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------

create table public.partners (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  -- Valor exato da opção do campo "afiliado" no HubSpot
  afiliado      text not null unique,
  contact_email text,
  created_at    timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'parceiro' check (role in ('vay', 'parceiro')),
  partner_id uuid references public.partners (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.expeditions (
  id         uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  name       text not null,
  city       text not null,
  start_date date not null,
  days       int  not null check (days > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index expeditions_partner_idx on public.expeditions (partner_id);

create table public.clients (
  id              uuid primary key default gen_random_uuid(),
  expedition_id   uuid not null references public.expeditions (id) on delete cascade,
  name            text not null,
  email           text not null default '',
  phone           text not null default '',
  stage           text not null default 'novo'
                  check (stage in ('novo', 'contato', 'proposta', 'fechado', 'desistiu')),
  -- 'novo' | 'existente' quando o contato for sincronizado com o HubSpot (fase 2)
  hubspot_status  text check (hubspot_status in ('novo', 'existente')),
  last_follow_up  date,
  note            text not null default '',
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index clients_expedition_idx on public.clients (expedition_id);
create unique index clients_exp_email_uniq on public.clients (expedition_id, lower(email)) where email <> '';

-- Negócios fechados (espelho do HubSpot; na fase 1 também podem ser lançados à mão pela Vay)
create table public.deals (
  id                     uuid primary key default gen_random_uuid(),
  hubspot_id             text unique,
  contact_name           text not null,
  email                  text not null default '',
  afiliado               text not null,
  closed_on              date not null,
  -- [{ "city": "Madrid", "date": "2026-11-13" }, ...] em ordem
  legs                   jsonb not null check (jsonb_typeof(legs) = 'array' and jsonb_array_length(legs) > 0),
  end_date               date not null,
  voo                    numeric(12, 2) not null default 0,
  hotel                  numeric(12, 2) not null default 0,
  seguro                 numeric(12, 2) not null default 0,
  override_expedition_id uuid references public.expeditions (id) on delete set null,
  override_none          boolean not null default false,
  reviewed               boolean not null default false,
  created_at             timestamptz not null default now()
);
create index deals_afiliado_idx on public.deals (afiliado);

-- ---------------------------------------------------------------
-- Funções auxiliares para as regras de acesso
-- ---------------------------------------------------------------

create or replace function public.is_vay() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'vay');
$$;

create or replace function public.my_partner_id() returns uuid
language sql stable security definer set search_path = public as $$
  select partner_id from profiles where id = auth.uid() and role = 'parceiro';
$$;

create or replace function public.my_afiliado() returns text
language sql stable security definer set search_path = public as $$
  select p.afiliado from profiles pr join partners p on p.id = pr.partner_id
  where pr.id = auth.uid() and pr.role = 'parceiro';
$$;

-- Cria o perfil quando um usuário é criado. Todo perfil nasce sem papel de equipe e sem
-- parceiro: o papel e o parceiro só são definidos pelo servidor (convite) ou por SQL, nunca
-- pelos metadados que o próprio usuário poderia enviar.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------

alter table public.partners    enable row level security;
alter table public.profiles    enable row level security;
alter table public.expeditions enable row level security;
alter table public.clients     enable row level security;
alter table public.deals       enable row level security;

-- partners
create policy partners_select on public.partners for select
  using (is_vay() or id = my_partner_id());
create policy partners_write on public.partners for all
  using (is_vay()) with check (is_vay());

-- profiles
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or is_vay());
create policy profiles_write on public.profiles for update
  using (is_vay()) with check (is_vay());

-- expeditions
create policy expeditions_select on public.expeditions for select
  using (is_vay() or partner_id = my_partner_id());
create policy expeditions_insert on public.expeditions for insert
  with check (is_vay() or partner_id = my_partner_id());
create policy expeditions_update on public.expeditions for update
  using (is_vay() or partner_id = my_partner_id())
  with check (is_vay() or partner_id = my_partner_id());
create policy expeditions_delete on public.expeditions for delete
  using (is_vay());

-- clients: o parceiro cadastra; o follow-up (etapa, nota) é da Vay
create policy clients_select on public.clients for select
  using (is_vay() or exists (
    select 1 from expeditions e where e.id = expedition_id and e.partner_id = my_partner_id()));
create policy clients_insert on public.clients for insert
  with check (is_vay() or (stage = 'novo' and exists (
    select 1 from expeditions e where e.id = expedition_id and e.partner_id = my_partner_id())));
create policy clients_update on public.clients for update
  using (is_vay()) with check (is_vay());
create policy clients_delete on public.clients for delete
  using (is_vay());

-- deals: o parceiro só lê os negócios marcados com o próprio afiliado
create policy deals_select on public.deals for select
  using (is_vay() or afiliado = my_afiliado());
create policy deals_write on public.deals for all
  using (is_vay()) with check (is_vay());
