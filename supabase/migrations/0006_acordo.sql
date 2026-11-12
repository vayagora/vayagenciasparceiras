-- Acordo de parceria por parceiro. Sem arquivo próprio, vale o acordo padrão (public/docs/regras-de-negocio-padrao.pdf).
-- O arquivo próprio fica no bucket "anexos", em acordos/<partner_id>/<arquivo>.

alter table public.partners add column agreement_path text;
alter table public.partners add column agreement_name text;

-- O parceiro baixa só o próprio acordo. (Envio e remoção: a Vay, pelas políticas da 0005.)
create policy anexos_select_acordo on storage.objects for select
  using (
    bucket_id = 'anexos'
    and (storage.foldername(name))[1] = 'acordos'
    and (storage.foldername(name))[2] = public.my_partner_id()::text
  );
