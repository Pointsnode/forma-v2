-- Demo calendar — M11 showcase. STAGING ONLY, service-role, idempotent. Seeds
-- meetings directly (no Calendly connection needed) so the grid shows all three
-- species. Two clusters: (a) the CURRENT month (relative to now()) so the default
-- view has meetings live — client check-ins with demo couples, a team call, two
-- discovery calls, and ONE canceled (the struck-through grammar must demo); (b) the
-- P&A wedding week in Jan 2027 — the MARQUEE month, where meetings sit beside the
-- wedding-day chips and a due task, so one screen shows meeting + wedding day + due
-- work at once. Wedding days come from existing demo events; due dates from tasks.
do $$
declare
  v_ws uuid;
  pa uuid := 'd1a00001-0000-4000-a000-000000000001';  -- Priya & Arjun
  d0 timestamptz := date_trunc('day', now());
begin
  select id into v_ws from public.workspaces where name = 'Atelier Demo Studio' order by created_at limit 1;
  if v_ws is null then return; end if;

  insert into public.meetings (workspace_id, calendly_event_uri, calendly_invitee_uri, event_type_name, title, invitee_name, invitee_email, start_at, end_at, status, join_url, cancel_url, reschedule_url) values
    (v_ws,'demo:ev1','demo:in1','Client check-in — 45 min','Client check-in','Priya & Arjun','priya@example.com', d0 + interval '3 days 10 hours',  d0 + interval '3 days 10 hours 45 minutes','scheduled','https://zoom.us/j/demo1', null, null),
    (v_ws,'demo:ev2','demo:in2','Team sync — 30 min','Team sync','Studio team','team@atelier.example',              d0 + interval '5 days 15 hours',  d0 + interval '5 days 15 hours 30 minutes','scheduled', null, null, null),
    (v_ws,'demo:ev3','demo:in3','Discovery call — 30 min','Discovery call','Camila Reyes','camila@example.com',        d0 + interval '8 days 17 hours',  d0 + interval '8 days 17 hours 30 minutes','scheduled', null, null, 'https://calendly.com/reschedule/demo'),
    (v_ws,'demo:ev4','demo:in4','Client check-in — 45 min','Client check-in','Sofía & Marco','sofia@example.com',      d0 + interval '12 days 12 hours', d0 + interval '12 days 12 hours 45 minutes','scheduled', null, null, null),
    (v_ws,'demo:ev5','demo:in5','Venue walkthrough — 60 min','Venue walkthrough','Emma & Lucas','emma@example.com',    d0 + interval '18 days 11 hours', d0 + interval '18 days 12 hours','scheduled', null, null, null),
    (v_ws,'demo:ev6','demo:in6','Discovery call — 30 min','Discovery call','Daniela Cruz','daniela@example.com',       d0 + interval '22 days 16 hours', d0 + interval '22 days 16 hours 30 minutes','canceled', null, 'https://calendly.com/cancel/demo', null),
    (v_ws,'demo:ev7','demo:in7','Final walkthrough — 60 min','Final walkthrough','Priya & Arjun','priya@example.com', timestamptz '2027-01-14 11:00:00-06', timestamptz '2027-01-14 12:00:00-06','scheduled', null, null, null),
    (v_ws,'demo:ev8','demo:in8','Rehearsal call — 30 min','Rehearsal call','Priya & Arjun','priya@example.com',       timestamptz '2027-01-15 09:30:00-06', timestamptz '2027-01-15 10:00:00-06','scheduled', null, null, null)
  on conflict (workspace_id, calendly_event_uri, calendly_invitee_uri) do update set
    start_at = excluded.start_at, end_at = excluded.end_at, status = excluded.status, event_type_name = excluded.event_type_name;

  -- due-work in the current month AND on the Jan-2027 marquee day (idempotent by title)
  insert into public.tasks (wedding_id, workspace_id, title, due_date, status)
    select pa, null, v.title, v.due, 'pending'
    from (values
      ('Confirm florals order',       (d0 + interval '6 days')::date),
      ('Send timeline to the couple', (d0 + interval '19 days')::date),
      ('Final headcount to caterer',  date '2027-01-15')
    ) as v(title, due)
    where not exists (select 1 from public.tasks x where x.wedding_id = pa and x.title = v.title);
end $$;
