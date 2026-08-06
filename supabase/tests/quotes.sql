-- 0026 quotes (L2) — the tokenized quote surface, hermetic. Proves the two new anon lookups
-- behave like rsvp_lookup: malformed/unknown/expired refuse with human errcodes; accept is the
-- intent (moves a lead to won + logs a 'quote' event) and is idempotent on double-accept; and
-- quote_lookup leaks NOTHING beyond what the page renders. begin;…rollback; hermetic.
begin;

insert into auth.users (id, email) values ('11111111-0000-0000-0000-0000000000c1', 'owner@q.forma');
insert into public.profiles (id, display_name, locale) values ('11111111-0000-0000-0000-0000000000c1', 'Gio', 'en') on conflict (id) do nothing;
insert into public.workspaces (id, kind, name, slug, created_by) values
  ('a0000000-0000-0000-0000-0000000000c1', 'studio', 'Verena & Co.', 'verena', '11111111-0000-0000-0000-0000000000c1');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('a0000000-0000-0000-0000-0000000000c1', '11111111-0000-0000-0000-0000000000c1', 'owner');

-- a lead in French; the quote leaves locale null so the lookup resolves to the lead's fr.
insert into public.leads (id, workspace_id, couple_display, source, stage, locale) values
  ('1ead0000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000c1', 'Anouk & Berat', 'website', 'quote_out', 'fr');

-- a live sent quote (valid) + an expired sent quote.
insert into public.client_quotes (id, workspace_id, lead_id, number, title, intro, currency, status, valid_until, access_token, locale) values
  ('90000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-0000000000c1', '1ead0000-0000-0000-0000-0000000000c1', 12, 'The plan', 'A January wedding.', 'USD', 'sent', current_date + 10, 'aaaaaaaaaaaaaaaa', null),
  ('90000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-0000000000c1', null, 13, 'Old', 'x', 'USD', 'sent', current_date - 1, 'bbbbbbbbbbbbbbbb', null);
insert into public.client_quote_lines (quote_id, section, section_sort, title, description, amount, sort) values
  ('90000000-0000-0000-0000-000000000001'::uuid, 'Full planning', 0, 'Planning & design', 'eleven months', 58000, 0),
  ('90000000-0000-0000-0000-000000000001'::uuid, 'Full planning', 0, 'The weekend', 'run of show', 18400, 1);

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

-- (1) malformed token → FM013
do $$ begin
  begin perform public.quote_lookup('not-hex-at-all');
    raise exception 'TEST FAIL: malformed token accepted';
  exception when sqlstate 'FM013' then null; end;
end $$;

-- (2) unknown token → FM010
do $$ begin
  begin perform public.quote_lookup('ffffffffffffffff');
    raise exception 'TEST FAIL: unknown token accepted';
  exception when sqlstate 'FM010' then null; end;
end $$;

-- (3) lookup leaks NOTHING beyond the rendered keys; locale resolves to the lead's fr; the
--     studio name IS present (the point of the DEFINER).
do $$ declare j jsonb; k text; begin
  j := public.quote_lookup('aaaaaaaaaaaaaaaa');
  for k in select jsonb_object_keys(j) loop
    if k not in ('quote','lines','studio_name','prepared_for','locale') then
      raise exception 'TEST FAIL: lookup leaked top-level key %', k;
    end if;
  end loop;
  for k in select jsonb_object_keys(j->'quote') loop
    if k not in ('id','number','title','intro','currency','status','valid_until','deposit_note','accepted_at','accepted_name') then
      raise exception 'TEST FAIL: quote leaked key %', k;
    end if;
  end loop;
  if j->>'studio_name' <> 'Verena & Co.' then raise exception 'TEST FAIL: studio_name wrong (%)', j->>'studio_name'; end if;
  if j->>'prepared_for' <> 'Anouk & Berat' then raise exception 'TEST FAIL: prepared_for wrong (%)', j->>'prepared_for'; end if;
  if j->>'locale' <> 'fr' then raise exception 'TEST FAIL: locale not resolved to lead fr (%)', j->>'locale'; end if;
  if jsonb_array_length(j->'lines') <> 2 then raise exception 'TEST FAIL: lines count (%)', jsonb_array_length(j->'lines'); end if;
end $$;

-- (4) expired sent quote → FM011
do $$ begin
  begin perform public.quote_accept('bbbbbbbbbbbbbbbb', 'Someone');
    raise exception 'TEST FAIL: expired quote accepted';
  exception when sqlstate 'FM011' then null; end;
end $$;

-- name required
do $$ begin
  begin perform public.quote_accept('aaaaaaaaaaaaaaaa', '   ');
    raise exception 'TEST FAIL: blank name accepted';
  exception when sqlstate 'FM013' then null; end;
end $$;

-- accept (the intent) + double-accept idempotency, both as anon
select public.quote_accept('aaaaaaaaaaaaaaaa', 'Anouk Berat');
select public.quote_accept('aaaaaaaaaaaaaaaa', 'Someone Else');

-- the returned payload after double-accept: still accepted, original name kept
do $$ declare j jsonb; begin
  j := public.quote_lookup('aaaaaaaaaaaaaaaa');
  if j->'quote'->>'status' <> 'accepted' then raise exception 'TEST FAIL: not accepted after accept'; end if;
  if j->'quote'->>'accepted_name' <> 'Anouk Berat' then raise exception 'TEST FAIL: double-accept overwrote name (%)', j->'quote'->>'accepted_name'; end if;
end $$;

-- verify the lead side-effects (reset role: anon cannot read leads under RLS)
reset role;
do $$ declare won text; ev int; begin
  select stage into won from public.leads where id = '1ead0000-0000-0000-0000-0000000000c1';
  if won <> 'won' then raise exception 'TEST FAIL: lead not moved to won (%)', won; end if;
  select count(*) into ev from public.lead_events where lead_id = '1ead0000-0000-0000-0000-0000000000c1' and kind = 'quote' and body = 'accepted';
  if ev <> 1 then raise exception 'TEST FAIL: expected exactly one quote event, got %', ev; end if;
end $$;

select 'quotes: ALL TESTS PASSED' as result;
rollback;
