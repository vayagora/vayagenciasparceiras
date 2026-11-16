-- Protótipo v37: histórico de comentários por cliente.
-- Substitui a observação escrita no sistema (clients.partner_note) e a nota interna (clients.note) na interface.
-- A observação principal continua sendo a do HubSpot (clients.hs_note).
-- As colunas antigas ficam no banco por enquanto, só deixam de ser usadas na interface.

create table public.client_comments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  internal boolean not null default false,       -- true = só a Vay vê
  author_id uuid references auth.users (id) on delete set null,
  author_name text not null,
  author_email text not null,
  created_at timestamptz not null default now()
);
create index on public.client_comments (client_id, created_at);
alter table public.client_comments enable row level security;

-- Vay vê tudo; parceiro vê só os públicos dos clientes das próprias expedições
create policy client_comments_select on public.client_comments for select
  using (
    is_vay()
    or (not internal and exists (
      select 1 from clients c join expeditions e on e.id = c.expedition_id
      where c.id = client_id and e.partner_id = my_partner_id()))
  );
-- Só a Vay insere; ninguém altera nem apaga (histórico imutável: sem políticas de update/delete)
create policy client_comments_insert on public.client_comments for insert
  with check (is_vay());

-- Dados existentes: observação para o parceiro → comentário público; nota interna → comentário interno
insert into public.client_comments (client_id, body, internal, author_name, author_email, created_at)
select id, trim(partner_note), false, 'Vay Agora', 'equipe@vayagora.com.br', coalesce(last_follow_up::timestamptz, created_at)
from public.clients where trim(partner_note) <> '';

insert into public.client_comments (client_id, body, internal, author_name, author_email, created_at)
select id, trim(note), true, 'Vay Agora', 'equipe@vayagora.com.br', coalesce(last_follow_up::timestamptz, created_at)
from public.clients where trim(note) <> '';

-- A nota interna antiga ficava em clients, que o parceiro pode ler (RLS por linha, não por coluna).
-- Agora ela está protegida em client_comments (internal = true); a coluna fica, mas vazia.
update public.clients set note = '' where note <> '';
