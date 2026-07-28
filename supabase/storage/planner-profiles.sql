-- Storage for M10 (§1B) — the public directory's photography. Applied directly to
-- the project (the storage schema is Supabase-managed and absent from PGlite, so
-- this lives outside migrations/ — but the policy DDL is versioned here). PUBLIC
-- bucket planner-profiles (unlike every other bucket): the hero + gallery are the
-- SEO/LLM-facing face of a planner's profile, served via getPublicUrl (stable, no
-- expiry). Paths are {workspace_id}/{uuid}.{ext}; only workspace members write/
-- delete under their own prefix. Images ≤5MB (app-enforced), 20MB bucket ceiling.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('planner-profiles', 'planner-profiles', true, 20971520,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Read: PUBLIC — but with NO storage.objects SELECT policy. A public bucket serves
-- object bytes by URL (getPublicUrl) purely from its `public` flag; it needs no
-- SELECT policy, and adding one only grants LISTING (enumerating every file), which
-- the linter flags (0025_public_bucket_allows_listing). We want crawlable object
-- URLs, not a listable bucket, so we deliberately omit the SELECT policy.

-- Write/delete: workspace members only, under their own {workspace_id} prefix.
drop policy if exists planner_profiles_insert on storage.objects;
create policy planner_profiles_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'planner-profiles' and private.is_workspace_member(((storage.foldername(name))[1])::uuid));
drop policy if exists planner_profiles_delete on storage.objects;
create policy planner_profiles_delete on storage.objects for delete to authenticated
  using (bucket_id = 'planner-profiles' and private.is_workspace_member(((storage.foldername(name))[1])::uuid));
