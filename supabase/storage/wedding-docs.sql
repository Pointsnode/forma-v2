-- Storage for M6 documents (source 'upload'). Private bucket wedding-docs; paths
-- {wedding_id}/{uuid}.{ext}; wedding-keyed RLS like contract-artifacts: staff +
-- billing members (couple/family, not day_of) read; staff + couple write ≤20MB.
-- allowed_mime_types MUST equal WEDDING_DOCS_MIMES in src/lib/bucket-mime.mjs
-- (bucket-mime logic test asserts it). Lives outside migrations/ (storage schema
-- is Supabase-managed, absent from PGlite).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wedding-docs', 'wedding-docs', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp','text/plain'])
on conflict (id) do update set
  public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists wedding_docs_select on storage.objects;
create policy wedding_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'wedding-docs' and (
    private.is_wedding_staff(((storage.foldername(name))[1])::uuid)
    or private.is_wedding_billing_member(((storage.foldername(name))[1])::uuid)));
drop policy if exists wedding_docs_insert on storage.objects;
create policy wedding_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'wedding-docs' and (
    private.is_wedding_staff(((storage.foldername(name))[1])::uuid)
    or private.is_wedding_billing_member(((storage.foldername(name))[1])::uuid)));
drop policy if exists wedding_docs_delete on storage.objects;
create policy wedding_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'wedding-docs' and private.is_wedding_staff(((storage.foldername(name))[1])::uuid));
