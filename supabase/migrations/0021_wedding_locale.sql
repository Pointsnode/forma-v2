-- 0021 — four languages in the portal. Additive only; anon matrix stays exactly 10
-- functions (no tables, no policies, no grants, no function changes).

-- (a) The locale_code enum was ('en','es'). profiles.locale is that enum, and Settings →
-- Language writes it, so the four-option toggle is a no-op at the DB until the enum knows
-- fr/it. Extending an enum is additive and matrix-neutral (same shape as 0020's vendor
-- kinds). NOTE FOR THE GATE: §3 described only the weddings column; this enum extension is
-- the minimal additive companion required for §1 (profiles.locale can otherwise never hold
-- fr/it). Flagged, not silent.
alter type public.locale_code add value if not exists 'fr';
alter type public.locale_code add value if not exists 'it';

-- (b) The wedding's own language. The planner's locale is hers (profiles.locale); the
-- WEDDING's language belongs to the couple and drives the couple portal, guest RSVP,
-- menus, signature pages and couple/guest emails. Nullable, no backfill: NULL means "fall
-- back" (today's behaviour). Text + check (not the enum) exactly as the spec wrote it.
alter table public.weddings
  add column if not exists locale text
  check (locale in ('en', 'es', 'fr', 'it'));

-- (c) The guest public pages (RSVP, menu) read their language from these two SECURITY
-- DEFINER lookups, which resolved the workspace-CREATOR's profiles.locale. They now
-- resolve the WEDDING's language first, falling back to the creator locale (then 'en')
-- when wedding.locale is null — today's behaviour unchanged for null. Anon-matrix note:
-- these are the SAME two functions, re-created with IDENTICAL signatures, SECURITY
-- DEFINER shape and grants (the public invoker wrappers are untouched); the count stays
-- exactly 10. Only the resolved locale value changes; rsvp_lookup already returned it,
-- menu_lookup now returns the same single scalar. No signature or other column change.

create or replace function private.rsvp_lookup(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.guests; wd public.weddings; loc text; is_open boolean;
begin
  if p_code !~ '^[a-f0-9]{16}$' then raise exception 'malformed code' using errcode = 'FM013'; end if;
  select * into g from public.guests where rsvp_code = p_code;
  if not found then raise exception 'invalid code' using errcode = 'FM010'; end if;
  select * into wd from public.weddings where id = g.wedding_id;
  select p.locale::text into loc from public.workspaces w join public.profiles p on p.id = w.created_by where w.id = wd.workspace_id;
  is_open := wd.rsvp_open and (wd.rsvp_deadline is null or wd.rsvp_deadline >= current_date);
  return jsonb_build_object(
    'guest', jsonb_build_object('full_name', g.full_name, 'plus_one_allowed', g.plus_one_allowed, 'plus_one_name', g.plus_one_name, 'dietary', g.dietary),
    'wedding', jsonb_build_object('couple_display', wd.couple_display, 'date_start', wd.date_start, 'date_end', wd.date_end, 'location_city', wd.location_city),
    'locale', coalesce(wd.locale, loc, 'en'),   -- ← wedding language first (was coalesce(loc,'en'))
    'open', is_open,
    'closed_reason', case when not wd.rsvp_open then 'closed' when wd.rsvp_deadline < current_date then 'expired' else null end,
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object('event_id', e.id, 'label', e.label, 'event_date', e.event_date, 'status', eg.rsvp_status) order by e.event_date nulls last, e.order_index), '[]'::jsonb)
      from public.event_guests eg join public.wedding_events e on e.id = eg.event_id
      where eg.guest_id = g.id and eg.invited
    )
  );
end $$;

create or replace function private.menu_lookup(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.guests; wd public.weddings; loc text;
begin
  if p_code !~ '^[a-f0-9]{16}$' then raise exception 'malformed code' using errcode = 'FM013'; end if;
  select * into g from public.guests where rsvp_code = p_code;
  if not found then raise exception 'no such guest' using errcode = 'FM010'; end if;
  select * into wd from public.weddings where id = g.wedding_id;
  select p.locale::text into loc from public.workspaces w join public.profiles p on p.id = w.created_by where w.id = wd.workspace_id;
  return jsonb_build_object(
    'guest', jsonb_build_object('full_name', g.full_name),
    'locale', coalesce(wd.locale, loc, 'en'),   -- ← NEW scalar: the wedding's language (was absent)
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', e.id, 'label', e.label, 'menu_id', m.id, 'locked', m.locked_at is not null,
        'choice_id', eg.menu_choice_id,
        'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'diet_tags', o.diet_tags) order by o.sort) from public.menu_options o where o.menu_id = m.id), '[]'::jsonb)
      ) order by e.event_date nulls last, e.order_index)
      from public.event_guests eg
      join public.wedding_events e on e.id = eg.event_id
      join public.menus m on m.event_id = e.id
      where eg.guest_id = g.id and eg.invited and eg.rsvp_status = 'yes'
        and exists (select 1 from public.menu_options o2 where o2.menu_id = m.id)
    ), '[]'::jsonb));
end $$;

-- (d) The signature page reads its payload from load_contract_as (jsonb), which calls
-- signer_from_token. signer_from_token RETURNS a contract_signers ROW — it cannot carry a
-- locale without a signature change, so it is left untouched; load_contract_as is the
-- payload carrier and gains the same single locale scalar the other two lookups return,
-- resolving coalesce(wedding.locale, creator-locale, 'en'). Identical signature, SECURITY
-- DEFINER shape and grants; the public invoker wrapper is untouched; the count stays 10.
create or replace function private.load_contract_as(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.contract_signers; c public.contracts; cur int; wloc text; cloc text;
begin
  s := private.signer_from_token(p_token);
  select * into c from public.contracts where id = s.contract_id;
  select min(sign_order) into cur from public.contract_signers where contract_id = c.id and signed_at is null and declined_at is null;
  -- the wedding's language, else the workspace creator's, else 'en' (today's behaviour for null)
  select w.locale, p.locale::text into wloc, cloc
    from public.weddings w
    join public.workspaces ws on ws.id = w.workspace_id
    join public.profiles p on p.id = ws.created_by
    where w.id = c.wedding_id;
  return jsonb_build_object(
    'contract', jsonb_build_object('id', c.id, 'title', c.title, 'kind', c.kind, 'status', c.status),
    'locale', coalesce(wloc, cloc, 'en'),   -- ← NEW scalar: the wedding's language
    'body', coalesce((select body from public.contract_draft_content where contract_id = c.id), ''),
    'me', jsonb_build_object('id', s.id, 'name', s.name, 'role', s.role, 'sign_order', s.sign_order, 'signed_at', s.signed_at, 'declined_at', s.declined_at),
    'my_turn', (cur is not null and cur = s.sign_order and c.status in ('sent','partially_signed')),
    'fields', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'key', f.field_key, 'label', f.label, 'merge_source', f.merge_source, 'signer_order', f.signer_order, 'required', f.required, 'value', coalesce(f.manual_value, f.resolved_value)) order by f.sort, f.created_at) from public.contract_fields f where f.contract_id = c.id), '[]'::jsonb),
    'signers', coalesce((select jsonb_agg(jsonb_build_object('name', z.name, 'role', z.role, 'sign_order', z.sign_order, 'signed', z.signed_at is not null, 'declined', z.declined_at is not null) order by z.sign_order) from public.contract_signers z where z.contract_id = c.id), '[]'::jsonb)
  );
end $$;
