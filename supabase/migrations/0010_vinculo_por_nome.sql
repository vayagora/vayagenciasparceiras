-- Reconhecimento por nome completo (quando contato do HubSpot, e-mail e telefone não batem).
-- O parceiro passa a ver o passageiro do próprio negócio cujo nome completo é igual ao de um cliente que ele
-- cadastrou, para a tela dele bater com a da Vay. Mesma regra de sameName() em src/lib/matching.ts.

-- Nome sem acentos, minúsculo e com espaços simples
create or replace function public.fold_name(s text) returns text
language sql immutable as $$
  select regexp_replace(lower(trim(translate(coalesce(s, ''),
    'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN'))), '\s+', ' ', 'g');
$$;

-- Nome completo igual (pelo menos nome e sobrenome; só o primeiro nome não basta)
create or replace function public.names_match(a text, b text) returns boolean
language sql immutable as $$
  select position(' ' in fold_name(a)) > 0 and fold_name(a) = fold_name(b);
$$;

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
      and (
        same_person(c.hubspot_contact_id, c.email, c.phone, p.hubspot_contact_id, p.email, p.phone)
        or names_match(c.name, p.name)
      )
  );
$$;
