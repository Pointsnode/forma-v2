-- Demo weddings — the M1 gate artifact. STAGING ONLY. Service-role (bypasses
-- RLS); run with the service key, never shipped to a client. Idempotent: fixed
-- UUIDs + upserts, so re-running is a no-op beyond refreshing values.
--
-- PHASE IS SET DIRECTLY HERE (service role), bypassing private.advance_wedding_phase.
-- That is deliberate and demo-only: the phase machine fails closed on the M4
-- venue predicate (no wedding can reach `details` through it until venues exist),
-- so the showcase seeds the phases the prototype depicts. The app itself never
-- writes phase directly.
--
-- Targets a studio named 'Atelier Demo Studio'. If a reviewer already created it
-- through the UI, the demo lands in their studio; otherwise it is created. Every
-- existing profile is added as an owner so any signed-in staging user sees the
-- showcase (re-run after new signups to include them).

do $$
declare
  v_ws uuid;
  pa uuid := 'd1a00001-0000-4000-a000-000000000001'; -- Priya & Arjun
  el uuid := 'd1a00002-0000-4000-a000-000000000002'; -- Emma & Lucas
  sm uuid := 'd1a00003-0000-4000-a000-000000000003'; -- Sofía & Marco
begin
  -- find-or-create the demo studio
  select id into v_ws from public.workspaces where name = 'Atelier Demo Studio' order by created_at limit 1;
  if v_ws is null then
    v_ws := 'd0570d10-0000-4000-a000-0000000000d5';
    insert into public.workspaces (id, kind, name, slug, created_by)
    values (v_ws, 'studio', 'Atelier Demo Studio', 'atelier-demo-studio',
            (select id from public.profiles order by created_at limit 1))
    on conflict (id) do nothing;
  end if;

  -- every staging profile sees the showcase
  insert into public.workspace_members (workspace_id, user_id, role)
    select v_ws, id, 'owner' from public.profiles
  on conflict do nothing;

  -- ── 1. Priya & Arjun — destination, 5 events, phase details ────────────────
  insert into public.weddings (id, workspace_id, slug, couple_display, partner_a, partner_b, kind, location_city, location_country, guest_target, budget_total)
  values (pa, v_ws, 'priya-arjun', 'Priya & Arjun', 'Priya', 'Arjun', 'destination', 'San Miguel de Allende', 'MX', 312, 480000)
  on conflict (id) do update set
    couple_display = excluded.couple_display, kind = excluded.kind,
    location_city = excluded.location_city, location_country = excluded.location_country,
    guest_target = excluded.guest_target, budget_total = excluded.budget_total;
  insert into public.wedding_events (id, wedding_id, label, kind, event_date, order_index, guest_target) values
    ('d1a00001-0000-4000-a000-0000000000e1', pa, 'Mehndi',         'ritual',    '2027-01-15', 1, 80),
    ('d1a00001-0000-4000-a000-0000000000e2', pa, 'Welcome dinner', 'dinner',    '2027-01-15', 2, 120),
    ('d1a00001-0000-4000-a000-0000000000e3', pa, 'Sangeet',        'party',     '2027-01-16', 3, 220),
    ('d1a00001-0000-4000-a000-0000000000e4', pa, 'Ceremony',       'ceremony',  '2027-01-17', 4, 312),
    ('d1a00001-0000-4000-a000-0000000000e5', pa, 'Reception',      'reception', '2027-01-17', 5, 312)
  on conflict (id) do update set
    label = excluded.label, kind = excluded.kind, event_date = excluded.event_date,
    order_index = excluded.order_index, guest_target = excluded.guest_target;
  delete from public.wedding_events where wedding_id = pa
    and id not in ('d1a00001-0000-4000-a000-0000000000e1','d1a00001-0000-4000-a000-0000000000e2','d1a00001-0000-4000-a000-0000000000e3','d1a00001-0000-4000-a000-0000000000e4','d1a00001-0000-4000-a000-0000000000e5');
  update public.weddings set phase = 'details' where id = pa;

  -- ── 2. Emma & Lucas — city, 1 event, phase details ─────────────────────────
  insert into public.weddings (id, workspace_id, slug, couple_display, partner_a, partner_b, kind, location_city, location_country, guest_target, budget_total)
  values (el, v_ws, 'emma-lucas', 'Emma & Lucas', 'Emma', 'Lucas', 'city', 'Mexico City', 'MX', 96, 85000)
  on conflict (id) do update set
    couple_display = excluded.couple_display, kind = excluded.kind,
    location_city = excluded.location_city, location_country = excluded.location_country,
    guest_target = excluded.guest_target, budget_total = excluded.budget_total;
  insert into public.wedding_events (id, wedding_id, label, kind, event_date, order_index, guest_target) values
    ('d1a00002-0000-4000-a000-0000000000e1', el, 'Wedding day', 'ceremony', '2026-10-10', 1, 96)
  on conflict (id) do update set
    label = excluded.label, kind = excluded.kind, event_date = excluded.event_date,
    order_index = excluded.order_index, guest_target = excluded.guest_target;
  delete from public.wedding_events where wedding_id = el
    and id <> 'd1a00002-0000-4000-a000-0000000000e1';
  update public.weddings set phase = 'details' where id = el;

  -- ── 3. Sofía & Marco — destination, 2 events, phase foundations ────────────
  insert into public.weddings (id, workspace_id, slug, couple_display, partner_a, partner_b, kind, location_city, location_country)
  values (sm, v_ws, 'sofia-marco', 'Sofía & Marco', 'Sofía', 'Marco', 'destination', 'Valle de Guadalupe', 'MX')
  on conflict (id) do update set
    couple_display = excluded.couple_display, kind = excluded.kind,
    location_city = excluded.location_city, location_country = excluded.location_country;
  insert into public.wedding_events (id, wedding_id, label, kind, event_date, order_index, guest_target) values
    ('d1a00003-0000-4000-a000-0000000000e1', sm, 'Ceremony',  'ceremony',  '2027-06-12', 1, null),
    ('d1a00003-0000-4000-a000-0000000000e2', sm, 'Reception', 'reception', '2027-06-12', 2, null)
  on conflict (id) do update set
    label = excluded.label, kind = excluded.kind, event_date = excluded.event_date,
    order_index = excluded.order_index;
  delete from public.wedding_events where wedding_id = sm
    and id not in ('d1a00003-0000-4000-a000-0000000000e1','d1a00003-0000-4000-a000-0000000000e2');
  update public.weddings set phase = 'foundations' where id = sm;
end $$;
