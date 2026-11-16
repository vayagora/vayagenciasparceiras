-- Rótulos de associação do HubSpot "Comprador" e "Passageiro" (SPEC 1.7).
-- is_buyer: quem comprou; is_passenger: quem viaja. Um comprador que não viaja (ex.: pai que compra para o filho)
-- fica guardado para exibir "comprado por …", mas não conta como passageiro nem como acompanhante.

alter table public.deal_passengers add column is_buyer boolean not null default false;
alter table public.deal_passengers add column is_passenger boolean not null default true;

-- A contagem de passageiros do negócio considera só quem viaja
create or replace function public.refresh_passenger_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  d uuid := coalesce(new.deal_id, old.deal_id);
begin
  update deals set passenger_count = (select count(*) from deal_passengers where deal_id = d and is_passenger)
  where id = d;
  if tg_op = 'UPDATE' and old.deal_id is distinct from new.deal_id then
    update deals set passenger_count = (select count(*) from deal_passengers where deal_id = old.deal_id and is_passenger)
    where id = old.deal_id;
  end if;
  return null;
end;
$$;

-- Nome para comparação: sem acentos, minúsculo, espaços simples e sem as partículas de/da/do/das/dos/e
-- ("Gabriela Tolentino Boaventura de Almeida" = "Gabriela Tolentino Boaventura Almeida").
create or replace function public.fold_name(s text) returns text
language sql immutable as $$
  select trim(regexp_replace(
    ' ' || regexp_replace(lower(trim(translate(coalesce(s, ''),
      'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN'))), '\s+', ' ', 'g') || ' ',
    ' ((de|da|do|das|dos|e) )+', ' ', 'g'));
$$;
