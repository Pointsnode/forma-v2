-- ═══ Studio logo (quotes only) ═══════════════════════════════════════════════
-- The studio's own mark, uploaded on the Profile page, heads its quotes. The file
-- lives in the private vendor-media bucket under {workspace_id}/studio-logos/{uuid}
-- (workspace-first, so the existing vendor_media_* prefix policies govern it — no
-- new storage policy). Only the PATH is stored here; the app serves it via a signed
-- URL (authenticated surfaces sign with the member's own client; the anon quote page
-- signs server-side via the admin client). Nullable: no logo is the norm.

alter table public.workspaces add column if not exists logo_path text;

-- Member-checked DEFINER write (workspaces_update is owner-only — the save_profile
-- pattern). NULL/blank clears the logo.
create or replace function private.set_studio_logo(p_workspace uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  update public.workspaces set logo_path = nullif(btrim(coalesce(p_path, '')), ''), updated_at = now() where id = p_workspace;
end $$;

-- ── quote_lookup: also surface the logo path so the anon quote page can head with
-- the studio's mark. Byte-identical to 0026 otherwise; the name still rides along so
-- preparedBy never loses the studio's name to a logo-only head.
create or replace function private.quote_lookup(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.client_quotes; ws_name text; ws_logo text; prepared text; lead_loc text; cloc text;
begin
  if p_token !~ '^[a-f0-9]{16}$' then raise exception 'malformed token' using errcode = 'FM013'; end if;
  select * into q from public.client_quotes where access_token = p_token;
  if not found then raise exception 'unknown quote' using errcode = 'FM010'; end if;

  select name, logo_path into ws_name, ws_logo from public.workspaces where id = q.workspace_id;
  select couple_display into prepared from public.leads where id = q.lead_id;
  if prepared is null then select couple_display into prepared from public.weddings where id = q.wedding_id; end if;
  select locale into lead_loc from public.leads where id = q.lead_id;
  select p.locale::text into cloc from public.workspaces ws join public.profiles p on p.id = ws.created_by where ws.id = q.workspace_id;

  return jsonb_build_object(
    'quote', jsonb_build_object(
      'id', q.id, 'number', q.number, 'title', q.title, 'intro', q.intro, 'currency', q.currency,
      'status', q.status, 'valid_until', q.valid_until, 'deposit_note', q.deposit_note,
      'accepted_at', q.accepted_at, 'accepted_name', q.accepted_name),
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'section', ql.section, 'section_sort', ql.section_sort,
        'title', ql.title, 'description', ql.description, 'amount', ql.amount, 'sort', ql.sort)
        order by ql.section_sort, ql.sort), '[]'::jsonb)
      from public.client_quote_lines ql where ql.quote_id = q.id),
    'studio_name', ws_name,
    'studio_logo_path', ws_logo,
    'prepared_for', prepared,
    'locale', coalesce(q.locale, lead_loc, cloc, 'en')
  );
end $$;

-- ═══ Grants — the write is authenticated-only (anon matrix unchanged at 12) ═════
create or replace function public.set_studio_logo(p_workspace uuid, p_path text)
  returns void language sql security invoker set search_path = public as $$ select private.set_studio_logo(p_workspace, p_path); $$;

revoke execute on function private.set_studio_logo(uuid, text), public.set_studio_logo(uuid, text) from public, anon;
grant execute on function private.set_studio_logo(uuid, text), public.set_studio_logo(uuid, text) to authenticated;
