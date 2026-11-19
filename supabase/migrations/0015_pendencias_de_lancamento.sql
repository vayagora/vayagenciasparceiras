-- SPEC 2.2: "Pendências de lançamento" na visão do parceiro.
-- O parceiro vê SÓ OS NOMES dos passageiros "A conferir" de negócios marcados como da agência dele no HubSpot
-- (origem + empresa associada) — na prática, negócios com mais de um passageiro.
-- Não vê: negócios não sinalizados, passageiros "Conferidos", nem nada além do nome.

-- Expedição do negócio da agência, calculada na sincronização (destino e data)
alter table public.deals add column matched_expedition_id uuid references public.expeditions (id) on delete set null;

-- Chave da pessoa, igual à do sistema: contato do HubSpot; sem contato, nome normalizado
create or replace function public.person_key(contact_id text, name text) returns text
language sql immutable as $$
  select case when coalesce(contact_id, '') <> '' then 'c:' || contact_id else 'n:' || public.fold_name(name) end;
$$;

-- Nomes pendentes da expedição para o parceiro logado (a Vay também pode chamar).
create or replace function public.partner_pending_names(exp_id uuid) returns table (person_name text)
language sql stable security definer set search_path = public as $$
  select distinct on (person_key(p.hubspot_contact_id, p.name)) p.name
  from deals d
  join expeditions e on e.id = d.matched_expedition_id
  join partners pa on pa.id = e.partner_id and pa.afiliado = d.afiliado
  join deal_passengers p on p.deal_id = d.id and p.is_passenger
  where d.matched_expedition_id = exp_id
    and d.signaled
    and d.passenger_count > 1
    and (is_vay() or e.partner_id = my_partner_id())
    -- já conferido pela Vay: não aparece
    and not exists (
      select 1 from expedition_reviews r
      where r.expedition_id = exp_id and r.person_key = person_key(p.hubspot_contact_id, p.name)
    )
    -- já está em Passageiros (negócio da agência com um passageiro nesta expedição): não aparece
    and not exists (
      select 1 from deals d2 join deal_passengers p2 on p2.deal_id = d2.id and p2.is_passenger
      where d2.matched_expedition_id = exp_id and d2.signaled and d2.passenger_count = 1
        and person_key(p2.hubspot_contact_id, p2.name) = person_key(p.hubspot_contact_id, p.name)
    )
  order by person_key(p.hubspot_contact_id, p.name), p.name;
$$;

revoke all on function public.partner_pending_names(uuid) from public;
grant execute on function public.partner_pending_names(uuid) to authenticated;
