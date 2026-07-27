-- Storage for M4 (§1C). Applied directly to the project (the storage schema is
-- Supabase-managed and absent from PGlite, so this lives outside migrations/ — but
-- the policy DDL is versioned here). Private bucket vendor-media; paths are
-- {workspace_id}/{vendor_id}/{uuid}.{ext}; workspace members read/write/delete only
-- under their own workspace prefix; nothing public; app serves via signed URLs.
-- Photos ≤5MB (app-enforced), files ≤20MB (bucket limit); images + pdf.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vendor-media', 'vendor-media', false, 20971520,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
on conflict (id) do update set
  public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Read: workspace members (the catalog owners) OR a wedding member whose wedding
-- has this vendor engaged (path segment 2 = vendor_id) — so the couple can see
-- photos of vendors presented to them, without any access to the wider catalog.
drop policy if exists vendor_media_select on storage.objects;
create policy vendor_media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'vendor-media'
    and (
      private.is_workspace_member(((storage.foldername(name))[1])::uuid)
      or exists (
        select 1 from public.wedding_vendors wv
        join public.wedding_members wm on wm.wedding_id = wv.wedding_id
        where wv.vendor_id = ((storage.foldername(name))[2])::uuid and wm.user_id = (select auth.uid())
      )
    )
  );
drop policy if exists vendor_media_insert on storage.objects;
create policy vendor_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vendor-media' and private.is_workspace_member(((storage.foldername(name))[1])::uuid));
drop policy if exists vendor_media_delete on storage.objects;
create policy vendor_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'vendor-media' and private.is_workspace_member(((storage.foldername(name))[1])::uuid));
