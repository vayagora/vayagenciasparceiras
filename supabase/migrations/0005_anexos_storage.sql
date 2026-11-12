-- Arquivos anexados aos produtos dos negócios (Supabase Storage, bucket privado "anexos").
-- Caminho: <deal_id>/<produto>/<arquivo>. A Vay envia e apaga; o parceiro baixa os dos próprios negócios.

insert into storage.buckets (id, name, public, file_size_limit)
values ('anexos', 'anexos', false, 20971520)
on conflict (id) do nothing;

-- Compara como texto: uma pasta que não é um id de negócio simplesmente não casa (sem erro de conversão).
create or replace function public.deal_folder_visible_to_partner(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from deals d where d.id::text = folder and d.signaled and d.afiliado = my_afiliado());
$$;

create policy anexos_select on storage.objects for select
  using (
    bucket_id = 'anexos'
    and (public.is_vay() or public.deal_folder_visible_to_partner((storage.foldername(name))[1]))
  );
create policy anexos_insert on storage.objects for insert
  with check (bucket_id = 'anexos' and public.is_vay());
create policy anexos_delete on storage.objects for delete
  using (bucket_id = 'anexos' and public.is_vay());
