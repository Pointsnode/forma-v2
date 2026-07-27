-- Storage for M5 (§1D bridge). Private bucket contract-artifacts holds the stamped
-- final PDF; the path is stored on contracts.artifact_path. M6 migrates the artifact
-- into a `documents` row. Paths are {workspace_id}/{contract_id}/{uuid}.pdf; workspace
-- members read/write, wedding members of the contract's wedding read (their own
-- signed PDF), served via short-lived signed URLs. Like vendor-media, this lives
-- outside migrations/ (storage schema is Supabase-managed, absent from PGlite).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contract-artifacts', 'contract-artifacts', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Read: workspace members, OR a wedding member whose wedding owns a contract whose
-- artifact sits under this path (path segment 2 = contract_id).
drop policy if exists contract_artifacts_select on storage.objects;
create policy contract_artifacts_select on storage.objects for select to authenticated
  using (
    bucket_id = 'contract-artifacts'
    and (
      private.is_workspace_member(((storage.foldername(name))[1])::uuid)
      or exists (
        select 1 from public.contracts c
        join public.wedding_members wm on wm.wedding_id = c.wedding_id
        where c.id = ((storage.foldername(name))[2])::uuid and wm.user_id = (select auth.uid())
      )
    )
  );
drop policy if exists contract_artifacts_insert on storage.objects;
create policy contract_artifacts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'contract-artifacts' and private.is_workspace_member(((storage.foldername(name))[1])::uuid));
drop policy if exists contract_artifacts_delete on storage.objects;
create policy contract_artifacts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'contract-artifacts' and private.is_workspace_member(((storage.foldername(name))[1])::uuid));
