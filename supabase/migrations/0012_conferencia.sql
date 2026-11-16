-- Conferência de negócio com registro (SPEC 1.8): quem conferiu, quando e quais avisos foram conferidos.
-- Se depois aparecer um aviso que não estava na conferência, o negócio volta para "Para conferir".
-- Conferências antigas (deals.reviewed sem linha aqui) continuam valendo para os avisos atuais.
-- Tabela separada de deals porque os avisos são só da Vay: o parceiro lê as próprias linhas de deals.

create table public.deal_reviews (
  deal_id          uuid primary key references public.deals (id) on delete cascade,
  flags            text[] not null default '{}', -- avisos que existiam na conferência
  reviewed_by      uuid references auth.users (id) on delete set null,
  reviewed_by_name text not null default '',
  reviewed_at      timestamptz not null default now()
);

alter table public.deal_reviews enable row level security;
create policy deal_reviews_vay on public.deal_reviews for all
  using (is_vay()) with check (is_vay());
