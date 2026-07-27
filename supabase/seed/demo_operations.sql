-- Demo operations — M6 showcase. STAGING ONLY, service-role, idempotent (guards on
-- P&A having no schedule yet). Sangeet run of show + menus (locked/unlocked),
-- floor plan with seated guests, design boards, manual tasks, one goal override.
do $$
declare
  v_ws uuid := '6dd03946-8121-4894-bbc5-34a8257a5548';
  pa uuid := 'd1a00001-0000-4000-a000-000000000001';
  sangeet uuid := 'd1a00001-0000-4000-a000-0000000000e3';
  reception uuid := 'd1a00001-0000-4000-a000-0000000000e5';
  mehndi uuid := 'd1a00001-0000-4000-a000-0000000000e1';
  m_sangeet uuid := '3e000001-0000-4000-a000-0000000000e3';
  m_recep uuid := '3e000001-0000-4000-a000-0000000000e5';
  fp uuid := 'f1000001-0000-4000-a000-0000000000e3';
  t1 uuid := '7ab10001-0000-4000-a000-000000000001'; t2 uuid := '7ab10001-0000-4000-a000-000000000002';
  t3 uuid := '7ab10001-0000-4000-a000-000000000003'; t4 uuid := '7ab10001-0000-4000-a000-000000000004';
  b1 uuid := 'b0a50001-0000-4000-a000-000000000001'; b2 uuid := 'b0a50001-0000-4000-a000-000000000002';
  g record; i int := 0; tbl uuid;
begin
  if v_ws is null then return; end if;
  if (select count(*) from public.schedule_items where wedding_id = pa) > 0 then return; end if;

  -- Sangeet run of show (the prototype's rows)
  insert into public.schedule_items (wedding_id, event_id, time, title, sort) values
    (pa, sangeet, '14:00','Vendor load-in · sound check', 1),
    (pa, sangeet, '19:00','Doors · welcome cocktails', 2),
    (pa, sangeet, '20:00','Family performances (7 acts, order locked)', 3),
    (pa, sangeet, '21:30','Dinner — live stations open', 4),
    (pa, sangeet, '23:00','Couple''s surprise number', 5),
    (pa, sangeet, '00:00','Bhangra block — non-negotiable', 6);
  -- Reception drafted, Mehndi drafted (2 of 5 empty — the "3 of 5" state)
  insert into public.schedule_items (wedding_id, event_id, time, title, sort) values
    (pa, reception, '19:00','Doors · cocktail hour on the terrace', 1),
    (pa, reception, '20:30','Entrances & first dance', 2);

  -- Sangeet menu (locked), Reception menu (unlocked, options)
  insert into public.menus (id, wedding_id, event_id, title, locked_at) values (m_sangeet, pa, sangeet, 'Sangeet dinner', now());
  insert into public.menu_options (menu_id, wedding_id, label, diet_tags, sort) values
    (m_sangeet, pa, 'Live chaat stations', array['vegetarian'], 0),
    (m_sangeet, pa, 'Paneer khada masala', array['vegetarian'], 1),
    (m_sangeet, pa, 'Lamb rogan josh', '{}', 2);
  insert into public.menus (id, wedding_id, event_id, title) values (m_recep, pa, reception, 'Reception dinner');
  insert into public.menu_options (menu_id, wedding_id, label, diet_tags, sort) values
    (m_recep, pa, 'Sea bass', '{}', 0),
    (m_recep, pa, 'Lamb barbacoa', '{}', 1);

  -- floor plan for Sangeet + 4 tables
  insert into public.floor_plans (id, wedding_id, event_id, name) values (fp, pa, sangeet, 'Terraza Vista — rooftop');
  insert into public.seating_tables (id, wedding_id, floor_plan_id, name, capacity, sort) values
    (t1, pa, fp, 'Table 1', 10, 1),(t2, pa, fp, 'Table 2', 10, 2),(t3, pa, fp, 'Table 3', 10, 3),(t4, pa, fp, 'Table 4', 10, 4);
  -- seat the first ~12 confirmed guests at Sangeet across the tables
  for g in select eg.guest_id from public.event_guests eg where eg.event_id = sangeet and eg.rsvp_status = 'yes' order by eg.guest_id limit 12 loop
    tbl := case (i % 4) when 0 then t1 when 1 then t2 when 2 then t3 else t4 end;
    insert into public.seats (wedding_id, table_id, event_id, guest_id) values (pa, tbl, sangeet, g.guest_id) on conflict do nothing;
    update public.event_guests set seat_ref = (select id from public.seats where event_id = sangeet and guest_id = g.guest_id) where event_id = sangeet and guest_id = g.guest_id;
    i := i + 1;
  end loop;

  -- design boards
  insert into public.design_boards (id, wedding_id, title, sort) values (b1, pa, 'Mandap concept', 0), (b2, pa, 'Reception tablescape', 1);
  insert into public.design_items (board_id, wedding_id, title, note, event_id, sort) values
    (b1, pa, 'Brass & bougainvillea', 'Structural, blush-forward', sangeet, 0),
    (b1, pa, 'Aisle florals', 'Kept to the aisle only', sangeet, 1),
    (b1, pa, 'Golden-hour mandap', 'Reference the couple''s photos', sangeet, 2),
    (b2, pa, 'Brass candlesticks', 'Sourced', reception, 0),
    (b2, pa, 'Low centerpieces', 'Sightlines across tables', reception, 1);

  -- documents (the prototype's four; contract artifacts already backfilled)
  insert into public.documents (wedding_id, title, source, event_id) values
    (pa, 'Venue site visit notes — May 18', 'upload', null),
    (pa, 'Insurance — event liability', 'upload', null),
    (pa, 'Guest visa & travel FAQ', 'upload', null),
    (pa, 'Meeting notes — couple check-in #7', 'upload', null);

  -- manual tasks (the studio bento's residue moves)
  insert into public.tasks (wedding_id, title, due_date) values
    (pa, 'Confirm mehndi artist count', current_date + 3),
    (pa, 'Send blush floral revision', current_date + 1);
  insert into public.tasks (workspace_id, title, due_date) values
    (v_ws, 'Final walkthrough at the venue', current_date + 10);

  -- one goal override detection can't see
  insert into public.wedding_goal_overrides (wedding_id, goal_key, status, note) values
    (pa, 'seating_started', 'manual_done', 'Sangeet seating drafted — 12 placed')
    on conflict (wedding_id, goal_key) do nothing;
end $$;
select
  (select count(*) from public.schedule_items) as schedule,
  (select count(*) from public.menus) as menus,
  (select count(*) from public.seats) as seats,
  (select count(*) from public.design_items) as design,
  (select count(*) from public.tasks) as tasks;
