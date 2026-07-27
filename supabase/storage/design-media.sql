-- Storage for M6 design boards. Private bucket design-media; paths
-- {wedding_id}/{uuid}.{ext}; staff + billing members (design is the couple's
-- playground too) read/write, staff delete. allowed_mime_types MUST equal
-- DESIGN_MEDIA_MIMES in src/lib/bucket-mime.mjs (bucket-mime logic test asserts it).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('design-media', 'design-media', false, 20971520, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists design_media_select on storage.objects;
create policy design_media_select on storage.objects for select to authenticated
  using (bucket_id = 'design-media' and (
    private.is_wedding_staff(((storage.foldername(name))[1])::uuid)
    or private.is_wedding_billing_member(((storage.foldername(name))[1])::uuid)));
drop policy if exists design_media_insert on storage.objects;
create policy design_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'design-media' and (
    private.is_wedding_staff(((storage.foldername(name))[1])::uuid)
    or private.is_wedding_billing_member(((storage.foldername(name))[1])::uuid)));
drop policy if exists design_media_delete on storage.objects;
create policy design_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'design-media' and (
    private.is_wedding_staff(((storage.foldername(name))[1])::uuid)
    or private.is_wedding_billing_member(((storage.foldername(name))[1])::uuid)));
