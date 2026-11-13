-- SPEC 1.3: forma de pagamento do negócio e cashback editado pela Vay (com histórico).

-- Formas de pagamento do HubSpot ("Forma de pagamento do cliente"); "Crédito na VAY" = abatimento de crédito
alter table public.deals add column payment_methods text[] not null default '{}';
-- Cashback final definido pela Vay; null = vale o calculado pelas regras
alter table public.deals add column cashback_override numeric(12, 2) check (cashback_override >= 0);

create table public.deal_cashback_history (
  id              uuid primary key default gen_random_uuid(),
  deal_id         uuid not null references public.deals (id) on delete cascade,
  old_value       numeric(12, 2),          -- null = era o calculado
  new_value       numeric(12, 2),          -- null = voltou ao calculado
  calculated      numeric(12, 2) not null, -- o que as regras davam no momento
  note            text not null default '',
  changed_by      uuid references auth.users (id) on delete set null,
  changed_by_name text not null default '',
  changed_at      timestamptz not null default now()
);
create index deal_cashback_history_deal_idx on public.deal_cashback_history (deal_id, changed_at);

-- Histórico é da Vay
alter table public.deal_cashback_history enable row level security;
create policy deal_cashback_history_vay on public.deal_cashback_history for all
  using (is_vay()) with check (is_vay());
