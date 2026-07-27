-- Storage for M5 (§1D bridge). Private bucket contract-artifacts holds the stamped
-- final PDF/HTML; the path is stored on contracts.artifact_path as
-- {wedding_id}/{contract_id}.html. M6 migrates the artifact into a `documents` row.
-- The allowed_mime_types below MUST equal ARTIFACT_ALLOWED_MIMES in
-- src/lib/contract-artifact-mime.mjs (the filing code uploads text/html) — the
-- contract-artifact logic test asserts they agree. Like vendor-media, this lives
-- outside migrations/ (storage schema is Supabase-managed, absent from PGlite).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contract-artifacts', 'contract-artifacts', false, 20971520, array['application/pdf','text/html'])
on conflict (id) do update set
  public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The artifact sits directly under its wedding ({wedding_id}/{contract_id}.html),
-- so folder segment 1 is the wedding id. Read: wedding staff or members. Write/
-- delete: wedding staff (the app files via service-role, which bypasses RLS).
drop policy if exists contract_artifacts_select on storage.objects;
create policy contract_artifacts_select on storage.objects for select to authenticated
  using (
    bucket_id = 'contract-artifacts'
    and (
      private.is_wedding_staff(((storage.foldername(name))[1])::uuid)
      or private.is_wedding_member(((storage.foldername(name))[1])::uuid)
    )
  );
drop policy if exists contract_artifacts_insert on storage.objects;
create policy contract_artifacts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'contract-artifacts' and private.is_wedding_staff(((storage.foldername(name))[1])::uuid));
drop policy if exists contract_artifacts_delete on storage.objects;
create policy contract_artifacts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'contract-artifacts' and private.is_wedding_staff(((storage.foldername(name))[1])::uuid));
