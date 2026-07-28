-- Demo directory — M10 showcase. STAGING ONLY, service-role, idempotent. Three
-- deliberate states that together prove the milestone's headline rules:
--   • Two PUBLISHED probe studios (Verena & Co., Marea) — real content + hosted
--     photography — are the public /planners face for screenshots + region pages +
--     sitemap + /llms.txt. They are memberless, so they live ONLY in the public
--     directory and never pollute a reviewer's studio.
--   • The Atelier DEMO studio gets full profile content but stays UNPUBLISHED — the
--     standing rule (demo data is never published) AND the live proof that an
--     unpublished profile is invisible through every public read.
--   • Two inquiries land on the demo studio → the cockpit inbox card (new = wine).
-- Photography note: probes reference hosted stock (guaranteed to render); real
-- planners upload to the planner-profiles bucket via the studio editor.
do $$
declare
  v_owner uuid := (select id from public.profiles order by created_at limit 1);
  v_demo uuid;
  v_verena uuid := 'd10eec10-0000-4000-a000-0000000000f1';
  v_marea uuid := 'd10eec10-0000-4000-a000-0000000000f2';
begin
  -- ── Probe 1 — Verena & Co. (Yucatán + Quintana Roo), PUBLISHED ──────────────
  insert into public.workspaces (id, kind, name, slug, created_by, profile_published, profile)
  values (v_verena, 'studio', 'Verena & Co.', 'verena-co', v_owner, true, jsonb_build_object(
    'tagline', jsonb_build_object('en','Coastal weddings, quietly done.','es','Bodas de mar, sin ruido.'),
    'about', jsonb_build_object(
      'en', E'We are a small studio on the Yucatán peninsula planning weddings for couples who want the day to feel like them — unhurried, warm, and a little bit wild.\n\nFrom a hacienda ceremony in Mérida to a barefoot dinner in Tulum, we hold every thread so you can be present.',
      'es', E'Somos un estudio pequeño en la península de Yucatán que planea bodas para parejas que quieren que el día se sienta suyo: sin prisa, cálido y un poco salvaje.\n\nDe una ceremonia en una hacienda de Mérida a una cena descalzos en Tulum, cuidamos cada hilo para que ustedes estén presentes.'),
    'hero', 'https://picsum.photos/seed/forma-verena-hero/1600/1000',
    'gallery', jsonb_build_array(
      'https://picsum.photos/seed/forma-verena-1/1200/1200',
      'https://picsum.photos/seed/forma-verena-2/1200/1200',
      'https://picsum.photos/seed/forma-verena-3/1200/1200',
      'https://picsum.photos/seed/forma-verena-4/1200/1200'),
    'services', jsonb_build_array(
      jsonb_build_object('name','Full planning & design','from_price',180000),
      jsonb_build_object('name','Destination weekend','from_price',95000),
      jsonb_build_object('name','Month-of coordination','from_price',48000)),
    'discovery_calls_enabled', true,
    'booking_url', 'https://calendly.com/forma-demo/discovery',
    'instagram', 'https://instagram.com/verena.co',
    'website', 'https://verena.co'))
  on conflict (id) do update set profile_published = excluded.profile_published, profile = excluded.profile, name = excluded.name;

  delete from public.workspace_service_areas where workspace_id = v_verena;
  insert into public.workspace_service_areas (workspace_id, country, region, city) values
    (v_verena, 'MX', 'Yucatán', 'Mérida'),
    (v_verena, 'MX', 'Quintana Roo', 'Tulum');

  -- ── Probe 2 — Marea (Jalisco + Nayarit), PUBLISHED ─────────────────────────
  insert into public.workspaces (id, kind, name, slug, created_by, profile_published, profile)
  values (v_marea, 'studio', 'Marea Bodas', 'marea', v_owner, true, jsonb_build_object(
    'tagline', jsonb_build_object('en','The Pacific coast, set for two.','es','La costa del Pacífico, puesta para dos.'),
    'about', jsonb_build_object(
      'en', E'Marea plans weddings along Mexico''s Pacific — Sayulita cliffs, Guadalajara courtyards, long tables under string light.\n\nWe are known for a calm hand and a good address book: the florists, the cooks, the players who make a place sing.',
      'es', E'Marea planea bodas en el Pacífico mexicano: los acantilados de Sayulita, los patios de Guadalajara, mesas largas bajo luces colgantes.\n\nNos conocen por la mano tranquila y una buena agenda: floristas, cocineros y músicos que hacen cantar un lugar.'),
    'hero', 'https://picsum.photos/seed/forma-marea-hero/1600/1000',
    'gallery', jsonb_build_array(
      'https://picsum.photos/seed/forma-marea-1/1200/1200',
      'https://picsum.photos/seed/forma-marea-2/1200/1200',
      'https://picsum.photos/seed/forma-marea-3/1200/1200',
      'https://picsum.photos/seed/forma-marea-4/1200/1200'),
    'services', jsonb_build_array(
      jsonb_build_object('name','Full planning','from_price',150000),
      jsonb_build_object('name','Design & styling','from_price',70000)),
    'discovery_calls_enabled', false,
    'instagram', 'https://instagram.com/marea.bodas'))
  on conflict (id) do update set profile_published = excluded.profile_published, profile = excluded.profile, name = excluded.name;

  delete from public.workspace_service_areas where workspace_id = v_marea;
  insert into public.workspace_service_areas (workspace_id, country, region, city) values
    (v_marea, 'MX', 'Jalisco', 'Guadalajara'),
    (v_marea, 'MX', 'Nayarit', 'Sayulita');

  -- ── The DEMO studio: full profile content, but NEVER published ──────────────
  select id into v_demo from public.workspaces where name = 'Atelier Demo Studio' order by created_at limit 1;
  if v_demo is not null then
    update public.workspaces set
      profile_published = false,  -- the standing rule: the demo is never public
      profile = jsonb_build_object(
        'tagline', jsonb_build_object('en','Weddings with an architect''s eye.','es','Bodas con ojo de arquitecta.'),
        'about', jsonb_build_object(
          'en','Atelier is our in-house showcase studio — a full, worked example of how a Forma profile reads once it is finished.',
          'es','Atelier es nuestro estudio de demostración: un ejemplo completo de cómo se ve un perfil de Forma ya terminado.'),
        'hero', 'https://picsum.photos/seed/forma-atelier-hero/1600/1000',
        'gallery', jsonb_build_array(
          'https://picsum.photos/seed/forma-atelier-1/1200/1200',
          'https://picsum.photos/seed/forma-atelier-2/1200/1200',
          'https://picsum.photos/seed/forma-atelier-3/1200/1200'),
        'services', jsonb_build_array(jsonb_build_object('name','Full planning','from_price',200000)))
      where id = v_demo;
    delete from public.workspace_service_areas where workspace_id = v_demo;
    insert into public.workspace_service_areas (workspace_id, country, region, city) values
      (v_demo, 'MX', 'Ciudad de México', 'CDMX');

    -- Two inbox inquiries on the demo studio (idempotent by fixed id) → cockpit card
    insert into public.inquiries (id, workspace_id, name, partner_name, email, phone, wedding_date, message, status) values
      ('d10eec10-0000-4000-a000-00000000a001', v_demo, 'Camila Reyes', 'Diego', 'camila.reyes@example.com', '+52 55 1234 5678', '2027-11-20',
        E'We saw your work and love the calm of it. We''re planning ~140 guests in San Miguel next November and would love to talk.', 'new'),
      ('d10eec10-0000-4000-a000-00000000a002', v_demo, 'Priyanka Nair', null, 'p.nair@example.com', null, null,
        E'Hi! Early days for us — a spring wedding, probably Oaxaca. Do you take destination clients?', 'new')
    on conflict (id) do nothing;
  end if;
end $$;
