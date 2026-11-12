-- Negócios encontrados por destino e data, mas não sinalizados no HubSpot
-- (sem "Origem do Negócio" = Afiliado e/ou sem a empresa da agência associada).
-- Ficam visíveis só para a Vay, não remuneram e indicam o que corrigir no HubSpot.

alter table public.deals add column name text not null default '';
-- false = encontrado por destino e data, mas não marcado como negócio de agência no HubSpot
alter table public.deals add column signaled boolean not null default true;
-- Como está no HubSpot (para dizer o que falta corrigir)
alter table public.deals add column hs_origem text not null default '';
-- Parceiro identificado pela empresa associada, mesmo quando a origem não está como Afiliado
alter table public.deals add column hs_agency text not null default '';

-- O parceiro só lê negócios sinalizados do próprio afiliado.
drop policy deals_select on public.deals;
create policy deals_select on public.deals for select
  using (is_vay() or (signaled and afiliado = my_afiliado()));

create or replace function public.passenger_visible_to_partner(p public.deal_passengers) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from deals d
    join expeditions e on e.partner_id = my_partner_id()
    join clients c on c.expedition_id = e.id
    where d.id = p.deal_id
      and d.signaled
      and d.afiliado = my_afiliado()
      and same_person(c.hubspot_contact_id, c.email, c.phone, p.hubspot_contact_id, p.email, p.phone)
  );
$$;
