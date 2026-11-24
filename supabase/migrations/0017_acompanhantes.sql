-- SPEC 2.4: negócio da agência com vários passageiros vai normalmente para "Passageiros".
-- A Vay pode marcar um passageiro como ACOMPANHANTE (não é da expedição): ele vai para "Conferidos" e some para o parceiro.
-- Ao concluir a expedição, a Vay confirma que conferiu os casos de vários passageiros. A Vay pode reabrir a expedição.

-- Tipo da marcação: conferido (negócio não sinalizado, conferido) ou acompanhante (tirado da lista de passageiros)
alter table public.expedition_reviews add column kind text not null default 'conferido' check (kind in ('conferido', 'acompanhante'));

-- O parceiro volta a ver todos os negócios sinalizados da própria agência (com um ou vários passageiros)
drop policy deals_select on public.deals;
create policy deals_select on public.deals for select
  using (is_vay() or (signaled and afiliado = my_afiliado()));

create or replace function public.deal_visible_to_partner(d_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from deals d where d.id = d_id and d.signaled and d.afiliado = my_afiliado());
$$;

create or replace function public.deal_folder_visible_to_partner(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from deals d where d.id::text = folder and d.signaled and d.afiliado = my_afiliado());
$$;

-- ...mas não vê o passageiro marcado como acompanhante (nem conferido) na expedição do negócio
create or replace function public.passenger_visible_to_partner(p public.deal_passengers) returns boolean
language sql stable security definer set search_path = public as $$
  select public.deal_visible_to_partner(p.deal_id)
    and not exists (
      select 1 from deals d join expedition_reviews r on r.expedition_id = d.matched_expedition_id
      where d.id = p.deal_id and r.person_key = person_key(p.hubspot_contact_id, p.name)
    );
$$;

-- "Pendências de lançamento" (0015) deixa de existir: os negócios da agência com vários passageiros já vão para a lista
drop function public.partner_pending_names(uuid);
