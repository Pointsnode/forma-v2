-- Demo partners — M4 showcase. STAGING ONLY, service-role, idempotent (seeds the
-- catalog only if the demo studio has none). Depends on demo_weddings.sql. No
-- storage photos (brand-solid fallbacks render; the gate uploads one live).
-- Engagements/statuses/quotes are inserted directly (service role) — the app moves
-- them only through the M4 functions.
do $$
declare
  v_ws uuid; planner uuid;
  pa uuid := 'd1a00001-0000-4000-a000-000000000001';  -- Priya & Arjun
  sm uuid := 'd1a00003-0000-4000-a000-000000000003';  -- Sofía & Marco
  sangeet uuid := 'd1a00001-0000-4000-a000-0000000000e3';
  sm_ceremony uuid; sm_reception uuid;
  -- vendor ids
  vin uuid := 'e1a00000-0000-4000-a000-000000000001';  -- Viñedo Santa Elena (venue)
  olv uuid := 'e1a00000-0000-4000-a000-000000000002';  -- Hacienda Los Olivos (venue)
  alm uuid := 'e1a00000-0000-4000-a000-000000000003';  -- Casa Alma (venue)
  flo uuid := 'e1a00000-0000-4000-a000-000000000004';  -- Flor y Canto (florals)
  eng_pres uuid; eng_short uuid; eng_quoted uuid; eng_flo uuid; q uuid; prop uuid;
begin
  select id into v_ws from public.workspaces where name = 'Atelier Demo Studio' order by created_at limit 1;
  if v_ws is null then return; end if;
  select created_by into planner from public.workspaces where id = v_ws;
  if planner is null then select user_id into planner from public.workspace_members where workspace_id = v_ws limit 1; end if;
  select id into sm_ceremony from public.wedding_events where wedding_id = sm and label = 'Ceremony';
  select id into sm_reception from public.wedding_events where wedding_id = sm and label = 'Reception';

  if (select count(*) from public.vendors where workspace_id = v_ws) = 0 then
    insert into public.vendors (id, workspace_id, name, kind, description, tags, cities, capacity, address) values
      (vin, v_ws, 'Viñedo Santa Elena', 'venue', 'Vineyard estate with terraced gardens.', array['vineyard','outdoor','destination'], array['Valle de Guadalupe'], 220, 'Ruta del Vino, BC'),
      (olv, v_ws, 'Hacienda Los Olivos', 'venue', 'Olive-grove hacienda, stone courtyards.', array['hacienda','courtyard'], array['Valle de Guadalupe'], 300, 'Camino Viejo, BC'),
      (alm, v_ws, 'Casa Alma', 'venue', 'Private villa for intimate celebrations.', array['villa','intimate'], array['San Miguel de Allende'], 120, 'Centro, SMA'),
      ('e1a00000-0000-4000-a000-000000000005', v_ws, 'Terraza Vista', 'venue', 'Rooftop with skyline views.', array['rooftop','city'], array['Mexico City'], 180, 'Reforma, CDMX'),
      ('e1a00000-0000-4000-a000-000000000006', v_ws, 'Museo del Carmen', 'venue', 'Historic museum courtyard.', array['historic','courtyard'], array['Mexico City'], 140, 'San Ángel, CDMX'),
      ('e1a00000-0000-4000-a000-000000000007', v_ws, 'Jardín Etéreo', 'venue', 'Walled garden, string lights.', array['garden'], array['San Miguel de Allende'], 200, 'Los Frailes, SMA'),
      (flo, v_ws, 'Flor y Canto', 'florals', 'Bold, structural florals.', array['florals','structural'], array['San Miguel de Allende'], null, null),
      ('e1a00000-0000-4000-a000-000000000008', v_ws, 'Cocina de Humo', 'catering', 'Wood-fire regional menus.', array['catering','wood-fire'], array['San Miguel de Allende'], null, null),
      ('e1a00000-0000-4000-a000-000000000009', v_ws, 'Luz Films', 'photo_video', 'Documentary photo & film.', array['photo','film'], array['Mexico City'], null, null),
      ('e1a00000-0000-4000-a000-00000000000a', v_ws, 'DJ Selva', 'music', 'Sets that read the room.', array['dj','music'], array['Mexico City'], null, null),
      ('e1a00000-0000-4000-a000-00000000000b', v_ws, 'Mariachi Los Reyes', 'music', 'Traditional mariachi, 8-piece.', array['mariachi'], array['Guadalajara'], null, null),
      ('e1a00000-0000-4000-a000-00000000000c', v_ws, 'Glow Beauty', 'beauty', 'Hair & makeup team.', array['beauty'], array['San Miguel de Allende'], null, null),
      ('e1a00000-0000-4000-a000-00000000000d', v_ws, 'Décor Norte', 'decor', 'Tablescapes & lighting.', array['decor','lighting'], array['Valle de Guadalupe'], null, null),
      ('e1a00000-0000-4000-a000-00000000000e', v_ws, 'Rentas del Valle', 'rentals', 'Tables, chairs, linens.', array['rentals'], array['Valle de Guadalupe'], null, null);

    -- S&M venue engagements: presented (open proposal), shortlisted, quoted
    insert into public.wedding_vendors (wedding_id, vendor_id, status, presented_estimate, presented_at) values
      (sm, vin, 'presented', 240000, now() - interval '5 days') returning id into eng_pres;
    insert into public.event_vendors (engagement_id, event_id, wedding_id) values (eng_pres, sm_ceremony, sm), (eng_pres, sm_reception, sm);
    insert into public.proposals (wedding_id, status, title, note, estimate_amount, engagement_id, created_by, sent_at)
      values (sm, 'sent', 'Viñedo Santa Elena — venue', 'Terraced gardens, capacity 220.', 240000, eng_pres, planner, now() - interval '5 days') returning id into prop;

    insert into public.wedding_vendors (wedding_id, vendor_id, status, presented_estimate, presented_at) values
      (sm, olv, 'shortlisted', 260000, now() - interval '6 days') returning id into eng_short;
    insert into public.event_vendors (engagement_id, event_id, wedding_id) values (eng_short, sm_ceremony, sm);

    insert into public.wedding_vendors (wedding_id, vendor_id, status, presented_estimate, presented_at) values
      (sm, alm, 'quoted', 180000, now() - interval '7 days') returning id into eng_quoted;
    insert into public.event_vendors (engagement_id, event_id, wedding_id) values (eng_quoted, sm_reception, sm);
    insert into public.quotes (wedding_id, engagement_id, status, amount, valid_until, note)
      values (sm, eng_quoted, 'received', 18500, current_date + 30, 'Includes tax and service.') returning id into q;

    -- P&A: florist booked, linked to Sangeet (florals — no venue-rule impact)
    insert into public.wedding_vendors (wedding_id, vendor_id, status, presented_estimate, presented_at) values
      (pa, flo, 'booked', 37000, now() - interval '10 days') returning id into eng_flo;
    insert into public.event_vendors (engagement_id, event_id, wedding_id) values (eng_flo, sangeet, pa);

    insert into public.activity (wedding_id, actor_id, verb, summary, created_at) values
      (sm, planner, 'vendor_presented', 'Viñedo Santa Elena', now() - interval '5 days'),
      (sm, planner, 'quote_received', 'Casa Alma', now() - interval '3 days'),
      (pa, planner, 'engagement_booked', 'Flor y Canto', now() - interval '10 days');
  end if;
end $$;
select
  (select count(*) from public.vendors) as vendors,
  (select count(*) from public.wedding_vendors) as engagements,
  (select count(*) from public.quotes) as quotes;
