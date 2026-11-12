-- Saldo do parceiro (extrato), etapas pelo HubSpot, detalhes e anexos dos produtos,
-- observação do HubSpot e aeroportos preferenciais da expedição.

-- ---------------------------------------------------------------
-- Etapa do cliente
-- A etapa exibida vem do HubSpot (não contactado · em negociação · compra concluída).
-- clients.stage guarda só a marcação manual da Vay: auto | nao_contactar | outro_lugar.
-- ---------------------------------------------------------------

alter table public.clients drop constraint clients_stage_check;
update public.clients set stage = case
  when stage = 'desistiu' and note ilike 'Comprou por outro canal%' then 'outro_lugar'
  when stage = 'desistiu' then 'nao_contactar'
  else 'auto'
end;
alter table public.clients alter column stage set default 'auto';
alter table public.clients add constraint clients_stage_check check (stage in ('auto', 'nao_contactar', 'outro_lugar'));

-- Situação no HubSpot calculada pela sincronização (negócios compatíveis com a expedição)
alter table public.clients add column hs_status text check (hs_status in ('negociacao', 'fechado'));
alter table public.clients add column hs_deal_id text;
-- "Observações para parceiro" do contato no HubSpot
alter table public.clients add column partner_note text not null default '';

drop policy clients_insert on public.clients;
create policy clients_insert on public.clients for insert
  with check (is_vay() or (stage = 'auto' and hs_status is null and partner_note = '' and exists (
    select 1 from expeditions e where e.id = expedition_id and e.partner_id = my_partner_id())));

-- ---------------------------------------------------------------
-- Expedição: destino livre + aeroportos preferenciais (código IATA)
-- ---------------------------------------------------------------

alter table public.expeditions add column arrival_airport text;
alter table public.expeditions add column departure_airport text;

-- ---------------------------------------------------------------
-- Detalhes do produto vindos do HubSpot (trechos, hotel, seguro)
-- ---------------------------------------------------------------

alter table public.deals add column details jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------
-- Extrato do saldo: lançamentos manuais da Vay.
-- As comissões dos negócios vinculados entram automaticamente (calculadas, não gravadas aqui).
-- ---------------------------------------------------------------

create table public.balance_entries (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partners (id) on delete cascade,
  kind        text not null check (kind in ('in', 'out')),
  amount      numeric(12, 2) not null check (amount > 0),
  entry_date  date not null default current_date,
  title       text not null,
  note        text not null default '',
  created_by  uuid references auth.users (id) on delete set null,
  created_by_name text not null default '',
  created_at  timestamptz not null default now()
);
create index balance_entries_partner_idx on public.balance_entries (partner_id, entry_date);

alter table public.balance_entries enable row level security;
create policy balance_entries_select on public.balance_entries for select
  using (is_vay() or partner_id = my_partner_id());
create policy balance_entries_write on public.balance_entries for all
  using (is_vay()) with check (is_vay());

-- ---------------------------------------------------------------
-- Comentários e arquivos por produto do negócio (a Vay adiciona; o parceiro vê os dos próprios negócios)
-- ---------------------------------------------------------------

create table public.deal_notes (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals (id) on delete cascade,
  product     text not null check (product in ('voo', 'hotel', 'seguro')),
  body        text not null default '',
  file_path   text,
  file_name   text,
  created_by  uuid references auth.users (id) on delete set null,
  created_by_name text not null default '',
  created_at  timestamptz not null default now(),
  check (body <> '' or file_path is not null)
);
create index deal_notes_deal_idx on public.deal_notes (deal_id);

create or replace function public.deal_visible_to_partner(d_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from deals d where d.id = d_id and d.signaled and d.afiliado = my_afiliado());
$$;

alter table public.deal_notes enable row level security;
create policy deal_notes_select on public.deal_notes for select
  using (is_vay() or deal_visible_to_partner(deal_id));
create policy deal_notes_write on public.deal_notes for all
  using (is_vay()) with check (is_vay());
