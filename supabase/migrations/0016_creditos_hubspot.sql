-- SPEC 2.3: saldo e extrato de créditos vêm do HubSpot, como no sistema de comissários.
-- Saldo = campo "Créditos abertos" (creditos_abertos) da Empresa da agência.
-- Extrato = registros do objeto "Créditos" (0-410) associados à Empresa. Só a sincronização grava.
-- "Finalizar expedição" passa a só registrar o valor apurado (a equipe lança o crédito no HubSpot).

alter table public.partners add column hubspot_company_id text;
alter table public.partners add column credit_balance numeric(12, 2);
alter table public.partners add column credit_synced_at timestamptz;

create table public.credit_entries (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partners (id) on delete cascade,
  hubspot_id  text not null unique,
  created_on  timestamptz not null,
  title       text not null default '',
  kind        text not null check (kind in ('acumulo', 'uso')),
  reason      text not null default '',
  amount      numeric(12, 2) not null default 0, -- com sinal: + entra, − sai
  synced_at   timestamptz not null default now()
);
create index credit_entries_partner_idx on public.credit_entries (partner_id, created_on desc);

-- Parceiro lê só os próprios lançamentos; ninguém grava pelo sistema (só a sincronização, com service_role)
alter table public.credit_entries enable row level security;
create policy credit_entries_select on public.credit_entries for select
  using (is_vay() or partner_id = my_partner_id());

-- Valor apurado no fechamento da expedição (congelado)
alter table public.expeditions add column finished_amount numeric(12, 2);
update public.expeditions e set finished_amount = b.amount
from public.balance_entries b where b.expedition_id = e.id and e.finished_at is not null;
