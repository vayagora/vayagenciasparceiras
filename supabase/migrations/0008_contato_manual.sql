-- Acompanhamento do contato feito pela Vay no sistema (não pelo HubSpot):
-- status do contato, responsável e observação para o parceiro.
-- Em negociação e compra concluída continuam vindo dos negócios do HubSpot e prevalecem.

alter table public.clients drop constraint clients_stage_check;
alter table public.clients add constraint clients_stage_check
  check (stage in ('auto', 'tentando', 'em_contato', 'chamar_depois', 'nao_contactar', 'outro_lugar'));

-- Responsável da Vay pelo contato (o nome fica gravado para o parceiro ver sem acessar perfis)
alter table public.clients add column owner_id uuid references auth.users (id) on delete set null;
alter table public.clients add column owner_name text not null default '';

-- O parceiro cadastra sem status, responsável ou observação
drop policy clients_insert on public.clients;
create policy clients_insert on public.clients for insert
  with check (is_vay() or (
    stage = 'auto' and hs_status is null and partner_note = '' and owner_id is null and owner_name = ''
    and exists (select 1 from expeditions e where e.id = expedition_id and e.partner_id = my_partner_id())));

-- Observação do HubSpot: campo "Observações para parceiro" do(s) negócio(s) do cliente para a expedição.
-- Enquanto o cliente não tem negócio, a observação é escrita no sistema (partner_note); depois, só no HubSpot.
alter table public.clients add column hs_note text not null default '';
