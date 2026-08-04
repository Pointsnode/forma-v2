-- Demo partners: M4 showcase, international catalog. STAGING ONLY, service-role,
-- idempotent (seeds the catalog only if the demo studio has none). Depends on
-- demo_weddings.sql. 56 vendors: 20 venues plus 36 vendors across 10 kinds,
-- including bar and coffee (which require migration 0020_vendor_kinds_bar_coffee).
-- Engagements, statuses and quotes are inserted directly (service role); the app
-- moves them only through the M4 functions.
--
-- Vendor photos are NOT seeded here. Photo rows and storage bytes come from
-- scripts/seed-demo-media.mjs (see supabase/seed/media/). A fresh environment
-- renders the brand fallback on catalog cards until that script is run.
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
    insert into public.vendors (id, workspace_id, name, kind, description, tags, cities, services, restrictions, perks, contact_name, contact_email, contact_phone, capacity, address) values
      ('e1a00000-0000-4000-a000-000000000049', v_ws, 'Apéro Bar', 'bar'::public.vendor_kind, 'Champagne and apéritif service from a vintage van. Coupe towers and spritzes at golden hour.', '{champagne,apero,cart}'::text[], '{Provence,Paris}'::text[], NULL, NULL, NULL, 'Léa Fabre', 'lea@aperobar.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000048', v_ws, 'Barra Libre MX', 'bar'::public.vendor_kind, 'Agave-forward bar program. Mezcal tastings, palomas by the pitcher, hand-carved ice.', '{mezcal,agave,bar}'::text[], '{CDMX,Oaxaca,Tulum}'::text[], NULL, NULL, NULL, 'Emilio Cuevas', 'emilio@barralibre.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000047', v_ws, 'Salt & Citrus Bar Co', 'bar'::public.vendor_kind, 'Craft cocktail bar team. Zero-dilution batching, a citrus program, brass-rail mobile bars.', '{cocktails,mobile-bar,craft}'::text[], '{NYC,"Hudson Valley"}'::text[], NULL, NULL, NULL, 'Priya Nair', 'priya@saltcitrus.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-00000000000c', v_ws, 'Glow Beauty', 'beauty'::public.vendor_kind, 'Hair & makeup team.', '{beauty}'::text[], '{"San Miguel de Allende"}'::text[], NULL, NULL, NULL, NULL, NULL, NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000021', v_ws, 'Henna House', 'beauty'::public.vendor_kind, 'Bridal mehndi studio. Two artists, traditional and contemporary patterns, up to 40 guests per session.', '{mehndi,henna,bridal}'::text[], '{"San Miguel de Allende"}'::text[], NULL, NULL, NULL, 'Farah Siddiqui', 'farah@hennahouse.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000008', v_ws, 'Cocina de Humo', 'catering'::public.vendor_kind, 'Wood-fire regional menus.', '{catering,wood-fire}'::text[], '{"San Miguel de Allende"}'::text[], NULL, NULL, NULL, NULL, NULL, NULL, null, NULL),
      ('e1a00000-0000-4000-a000-00000000002c', v_ws, 'Cocina de Valle', 'catering'::public.vendor_kind, 'Valle de Guadalupe tasting menus. Wine-country plates built around local harvests.', '{wine-country,tasting-menu}'::text[], '{"Valle de Guadalupe"}'::text[], NULL, NULL, NULL, 'Elena Madrigal', 'elena@cocinadevalle.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-00000000002d', v_ws, 'Fuego y Sal', 'catering'::public.vendor_kind, 'Open-fire cooking in the vineyards. Whole roasts, salt-baked fish, family style.', '{open-fire,family-style}'::text[], '{"Valle de Guadalupe"}'::text[], NULL, NULL, NULL, 'Raúl Ochoa', 'raul@fuegoysal.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000023', v_ws, 'Harvest & Hearth', 'catering'::public.vendor_kind, 'Farm-to-table catering. Long-table harvest dinners, wood-fired mains, Hudson Valley producers.', '{farm-to-table,seasonal}'::text[], '{"Hudson Valley"}'::text[], NULL, NULL, NULL, 'Dana Porter', 'dana@harvesthearth.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000028', v_ws, 'Mar y Sal', 'catering'::public.vendor_kind, 'Beachside catering. Raw bar, wood-grilled catch, tacos al pastor at midnight.', '{seafood,raw-bar,beach}'::text[], '{Tulum}'::text[], NULL, NULL, NULL, 'Ximena Ríos', 'ximena@marysal.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-00000000004a', v_ws, 'Café de Olla Cart', 'coffee'::public.vendor_kind, 'Traditional café de olla from a hand-painted cart. Cinnamon, piloncillo, clay cups.', '{coffee,cart,traditional}'::text[], '{CDMX,"San Miguel de Allende"}'::text[], NULL, NULL, NULL, 'Rosa Delgado', 'rosa@cafedeolla.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-00000000004c', v_ws, 'North Bean Coffee Truck', 'coffee'::public.vendor_kind, 'Specialty coffee truck. Pour-overs and oat flat whites for morning-after brunches.', '{coffee,truck,specialty}'::text[], '{Whistler,Vancouver}'::text[], NULL, NULL, NULL, 'Jess Tran', 'jess@northbean.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-00000000004b', v_ws, 'Primo Espresso', 'coffee'::public.vendor_kind, 'Italian espresso cart. Lever machine, affogato bar, late-night doppio service.', '{espresso,cart,italian}'::text[], '{Florence,"Lake Como"}'::text[], NULL, NULL, NULL, 'Gianni Moretti', 'gianni@primoespresso.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000043', v_ws, 'Atelier Lumen', 'decor'::public.vendor_kind, 'Lighting-first event design. Candle plans, festoon canopies, projection-free rooms that glow.', '{lighting,design,candles}'::text[], '{Paris,Provence}'::text[], NULL, NULL, NULL, 'Margaux Denis', 'margaux@atelierlumen.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-00000000000d', v_ws, 'Décor Norte', 'decor'::public.vendor_kind, 'Tablescapes & lighting.', '{decor,lighting}'::text[], '{"Valle de Guadalupe"}'::text[], NULL, NULL, NULL, NULL, NULL, NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000044', v_ws, 'Forma y Fibra', 'decor'::public.vendor_kind, 'Oaxacan textile styling. Handwoven runners, palm fans, barro negro accents from named artisans.', '{textiles,artisan,oaxaca}'::text[], '{Oaxaca,CDMX}'::text[], NULL, NULL, NULL, 'Itzel Ramos', 'itzel@formayfibra.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000020', v_ws, 'Marigold & Co', 'decor'::public.vendor_kind, 'South Asian wedding design. Mandaps, phoolon ki chadar, brass and marigold installations built in-house.', '{mandap,south-asian,decor}'::text[], '{"San Miguel de Allende",CDMX}'::text[], NULL, NULL, NULL, 'Anjali Mehra', 'anjali@marigoldco.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000029', v_ws, 'Bloom Tulum', 'florals'::public.vendor_kind, 'Tropical florals with restraint. Palms, orchids, local greenery.', '{tropical,florals}'::text[], '{Tulum}'::text[], NULL, NULL, NULL, 'Karla Puc', 'karla@bloomtulum.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000004', v_ws, 'Flor y Canto', 'florals'::public.vendor_kind, 'Bold, structural florals.', '{florals,structural}'::text[], '{"San Miguel de Allende"}'::text[], NULL, NULL, NULL, NULL, NULL, NULL, null, NULL),
      ('e1a00000-0000-4000-a000-00000000002e', v_ws, 'Flores del Valle', 'florals'::public.vendor_kind, 'Vineyard florals. Olive branch, garden roses, candlelight-first tablescapes.', '{florals,vineyard}'::text[], '{"Valle de Guadalupe"}'::text[], NULL, NULL, NULL, 'Marta Ibarra', 'marta@floresdelvalle.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000024', v_ws, 'Wildstem Florals', 'florals'::public.vendor_kind, 'Loose, garden-style florals grown and foraged in the valley.', '{garden-style,seasonal}'::text[], '{"Hudson Valley"}'::text[], NULL, NULL, NULL, 'June Bennett', 'june@wildstem.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000042', v_ws, 'Coro delle Colline', 'music'::public.vendor_kind, 'String quartet from the Tuscan hills. Vivaldi to film scores for ceremonies and dinners.', '{strings,quartet,classical}'::text[], '{Florence,Tuscany}'::text[], NULL, NULL, NULL, 'Elisa Fontana', 'elisa@corocolline.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000022', v_ws, 'Dhol Riders', 'music'::public.vendor_kind, 'High-energy dhol drummers for baraat and sangeet, traveling anywhere in Mexico.', '{dhol,baraat,sangeet}'::text[], '{CDMX}'::text[], NULL, NULL, NULL, 'Harpreet Singh', 'harpreet@dholriders.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000041', v_ws, 'Discoteca Bruna', 'music'::public.vendor_kind, 'Vinyl-only DJ duo. Latin funk, cumbia and disco from two turntables and a rotary mixer.', '{dj,vinyl,cumbia}'::text[], '{CDMX,Guadalajara}'::text[], NULL, NULL, NULL, 'Bruna Ortiz', 'bruna@discoteca.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-00000000000a', v_ws, 'DJ Selva', 'music'::public.vendor_kind, 'Sets that read the room.', '{dj,music}'::text[], '{"Mexico City"}'::text[], NULL, NULL, NULL, NULL, NULL, NULL, null, NULL),
      ('e1a00000-0000-4000-a000-00000000000b', v_ws, 'Mariachi Los Reyes', 'music'::public.vendor_kind, 'Traditional mariachi, 8-piece.', '{mariachi}'::text[], '{Guadalajara}'::text[], NULL, NULL, NULL, NULL, NULL, NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000040', v_ws, 'Motif Sound', 'music'::public.vendor_kind, 'Modern wedding DJs. Open-format sets, seamless ceremony-to-party audio, silent-disco add-on.', '{dj,modern,open-format}'::text[], '{NYC,"Hudson Valley"}'::text[], NULL, NULL, NULL, 'Devon Clark', 'devon@motifsound.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-00000000002b', v_ws, 'Selva Sound', 'music'::public.vendor_kind, 'Acoustic trio for ceremonies, DJ sets after dark. One console, zero fuss.', '{acoustic,dj,beach}'::text[], '{Tulum}'::text[], NULL, NULL, NULL, 'Pablo Mena', 'pablo@selvasound.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000025', v_ws, 'The Hudson Five', 'music'::public.vendor_kind, 'Five-piece band playing jazz standards through Motown to a packed dancefloor.', '{band,live-music}'::text[], '{"Hudson Valley",NYC}'::text[], NULL, NULL, NULL, 'Marcus Cole', 'marcus@hudsonfive.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-00000000002a', v_ws, 'Golden Hour Photo', 'photo_video'::public.vendor_kind, 'Sun-soaked editorial photography for destination weddings.', '{photo,editorial,beach}'::text[], '{Tulum,"Riviera Maya"}'::text[], NULL, NULL, NULL, 'Iván Torres', 'ivan@goldenhour.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000009', v_ws, 'Luz Films', 'photo_video'::public.vendor_kind, 'Documentary photo & film.', '{photo,film}'::text[], '{"Mexico City"}'::text[], NULL, NULL, NULL, NULL, NULL, NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000026', v_ws, 'North Light Photo', 'photo_video'::public.vendor_kind, 'Quiet documentary photography. Film and digital, no posing.', '{photo,documentary,film}'::text[], '{"Hudson Valley",NYC}'::text[], NULL, NULL, NULL, 'Sarah Lindqvist', 'sarah@northlight.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000027', v_ws, 'Hudson Rentals Co', 'rentals'::public.vendor_kind, 'Farm tables, crossback chairs, linen and glassware, delivered valley-wide.', '{rentals,tables,linen}'::text[], '{"Hudson Valley"}'::text[], NULL, NULL, NULL, 'Tom Sullivan', 'tom@hudsonrentals.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000045', v_ws, 'Maison Louer', 'rentals'::public.vendor_kind, 'Château furniture rental. Gilt chairs, marble-top consoles, vintage glassware from French estates.', '{rentals,vintage,french}'::text[], '{Paris,Provence}'::text[], NULL, NULL, NULL, 'Hugo Marchand', 'hugo@maisonlouer.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-00000000000e', v_ws, 'Rentas del Valle', 'rentals'::public.vendor_kind, 'Tables, chairs, linens.', '{rentals}'::text[], '{"Valle de Guadalupe"}'::text[], NULL, NULL, NULL, NULL, NULL, NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000046', v_ws, 'Tavola Rentals', 'rentals'::public.vendor_kind, 'Italian long tables in chestnut and travertine, ceramics and linen for al fresco dinners.', '{rentals,tables,italian}'::text[], '{Florence,Rome}'::text[], NULL, NULL, NULL, 'Paolo Greco', 'paolo@tavola.demo', NULL, null, NULL),
      ('e1a00000-0000-4000-a000-000000000003', v_ws, 'Casa Alma', 'venue'::public.vendor_kind, 'Private villa for intimate celebrations.', '{villa,intimate}'::text[], '{"San Miguel de Allende"}'::text[], NULL, NULL, NULL, NULL, NULL, NULL, 120, 'Centro, SMA'),
      ('e1a00000-0000-4000-a000-000000000035', v_ws, 'Cedar & Fjord Lodge', 'venue'::public.vendor_kind, 'Timber lodge between mountains and sea. Fjord views, fire terraces, alpine light.', '{lodge,mountain,fjord}'::text[], '{Whistler,BC}'::text[], NULL, NULL, NULL, 'Naomi Clarke', 'naomi@cedarfjord.demo', NULL, 110, 'Whistler, British Columbia'),
      ('e1a00000-0000-4000-a000-000000000015', v_ws, 'Cenote Azul', 'venue'::public.vendor_kind, 'Private cenote for candlelit dinners and vow ceremonies, 60 guests at most.', '{cenote,intimate,dinner}'::text[], '{"Riviera Maya"}'::text[], NULL, NULL, NULL, 'Diego Canul', 'diego@cenoteazul.demo', NULL, 60, 'Ruta de los Cenotes'),
      ('e1a00000-0000-4000-a000-000000000033', v_ws, 'Château Beaumont', 'venue'::public.vendor_kind, '18th-century Provençal château. Lavender courtyard, plane-tree allée, vaulted orangerie.', '{chateau,provence,lavender}'::text[], '{Provence,Aix-en-Provence}'::text[], NULL, NULL, NULL, 'Camille Roux', 'camille@beaumont.demo', NULL, 200, 'Luberon, Provence'),
      ('e1a00000-0000-4000-a000-000000000034', v_ws, 'Clos de Pierre', 'venue'::public.vendor_kind, 'Working Bordeaux wine estate. Stone cellars for dinner, ceremonies between the rows.', '{vineyard,bordeaux,cellar}'::text[], '{Bordeaux}'::text[], NULL, NULL, NULL, 'Antoine Leclerc', 'antoine@closdepierre.demo', NULL, 140, 'Saint-Émilion'),
      ('e1a00000-0000-4000-a000-000000000013', v_ws, 'Foxglove Farm', 'venue'::public.vendor_kind, 'Working flower farm with a glasshouse for dinners and a hilltop ceremony lawn.', '{farm,glasshouse,garden}'::text[], '{"Hudson Valley"}'::text[], NULL, NULL, NULL, 'Peter Hayes', 'peter@foxglove.demo', NULL, 200, 'Hudson, NY'),
      ('e1a00000-0000-4000-a000-000000000002', v_ws, 'Hacienda Los Olivos', 'venue'::public.vendor_kind, 'Olive-grove hacienda, stone courtyards.', '{hacienda,courtyard}'::text[], '{"Valle de Guadalupe"}'::text[], NULL, NULL, NULL, NULL, NULL, NULL, 300, 'Camino Viejo, BC'),
      ('e1a00000-0000-4000-a000-000000000014', v_ws, 'Hacienda San Gabriel', 'venue'::public.vendor_kind, 'Grand 17th-century hacienda with a chapel, three courtyards and gardens that hold a full baraat and 350 guests.', '{hacienda,historic,large}'::text[], '{"San Miguel de Allende"}'::text[], NULL, NULL, NULL, 'Lucía Fernández', 'lucia@sangabriel.demo', NULL, 350, 'Camino a Dolores km 4, SMA'),
      ('e1a00000-0000-4000-a000-000000000007', v_ws, 'Jardín Etéreo', 'venue'::public.vendor_kind, 'Walled garden, string lights.', '{garden}'::text[], '{"San Miguel de Allende"}'::text[], NULL, NULL, NULL, NULL, NULL, NULL, 200, 'Los Frailes, SMA'),
      ('e1a00000-0000-4000-a000-000000000036', v_ws, 'Lakefield House', 'venue'::public.vendor_kind, 'Winery estate in Prince Edward County. Restored barn, lake breeze, long-table harvest dinners.', '{winery,barn,ontario}'::text[], '{"Prince Edward County",Toronto}'::text[], NULL, NULL, NULL, 'Graham Ellis', 'graham@lakefield.demo', NULL, 150, 'Picton, Ontario'),
      ('e1a00000-0000-4000-a000-000000000006', v_ws, 'Museo del Carmen', 'venue'::public.vendor_kind, 'Historic museum courtyard.', '{historic,courtyard}'::text[], '{"Mexico City"}'::text[], NULL, NULL, NULL, NULL, NULL, NULL, 140, 'San Ángel, CDMX'),
      ('e1a00000-0000-4000-a000-000000000011', v_ws, 'Nido de Sal', 'venue'::public.vendor_kind, 'Jungle-meets-beach venue with an open palapa, cenote-fed pools and chef''s kitchen.', '{beach,jungle,palapa}'::text[], '{Tulum}'::text[], NULL, NULL, NULL, 'Andrés Kuyoc', 'andres@nidodesal.demo', NULL, 120, 'Zona Hotelera, Tulum'),
      ('e1a00000-0000-4000-a000-000000000031', v_ws, 'Palazzo Lumia', 'venue'::public.vendor_kind, 'Cliffside palazzo on the Amalfi coast. Lemon gardens and a sea terrace for sunset ceremonies.', '{coast,terrace,amalfi}'::text[], '{Amalfi,Positano}'::text[], NULL, NULL, NULL, 'Sofia Esposito', 'sofia@palazzolumia.demo', NULL, 90, 'Via Marina, Amalfi'),
      ('e1a00000-0000-4000-a000-000000000010', v_ws, 'Playa Escondida', 'venue'::public.vendor_kind, 'Private beach club with nine villas, palm grove and a protected cove. Barefoot ceremonies on the sand; dinner under string lights.', '{beach,villas,intimate,destination}'::text[], '{Tulum}'::text[], NULL, NULL, NULL, 'Marisol Vega', 'marisol@playaescondida.demo', NULL, 80, 'Carretera Tulum-Boca Paila km 8'),
      ('e1a00000-0000-4000-a000-000000000037', v_ws, 'Sea Cliff House', 'venue'::public.vendor_kind, 'Big Sur clifftop house. Redwoods behind, Pacific below, ceremonies on the bluff.', '{cliff,ocean,bigsur}'::text[], '{"Big Sur",California}'::text[], NULL, NULL, NULL, 'Rowan Miles', 'rowan@seacliff.demo', NULL, 80, 'Highway 1, Big Sur'),
      ('e1a00000-0000-4000-a000-000000000012', v_ws, 'Stonefields Estate', 'venue'::public.vendor_kind, 'Restored 1850s stone barn on 40 acres. Oak beams, meadow ceremonies, catering barn with full back-of-house.', '{barn,estate,autumn}'::text[], '{"Hudson Valley"}'::text[], NULL, NULL, NULL, 'Claire Whitman', 'claire@stonefields.demo', NULL, 160, 'Rhinebeck, NY'),
      ('e1a00000-0000-4000-a000-000000000005', v_ws, 'Terraza Vista', 'venue'::public.vendor_kind, 'Rooftop with skyline views.', '{rooftop,city}'::text[], '{"Mexico City"}'::text[], NULL, NULL, NULL, NULL, NULL, NULL, 180, 'Reforma, CDMX'),
      ('e1a00000-0000-4000-a000-000000000032', v_ws, 'Villa del Lago', 'venue'::public.vendor_kind, 'Lakefront villa on Lake Como. Boat arrivals, marble loggia, gardens to the water.', '{lake,villa,como}'::text[], '{"Lake Como"}'::text[], NULL, NULL, NULL, 'Marco Rivetti', 'marco@villadellago.demo', NULL, 120, 'Bellagio, Lago di Como'),
      ('e1a00000-0000-4000-a000-000000000030', v_ws, 'Villa Serrafiori', 'venue'::public.vendor_kind, 'Renaissance villa in the Tuscan hills. Cypress drive, olive terraces, dinners in the limonaia.', '{villa,tuscany,historic}'::text[], '{Florence,Tuscany}'::text[], NULL, NULL, NULL, 'Chiara Bandini', 'chiara@serrafiori.demo', NULL, 180, 'Val d''Orcia, Toscana'),
      ('e1a00000-0000-4000-a000-000000000001', v_ws, 'Viñedo Santa Elena', 'venue'::public.vendor_kind, 'Vineyard estate with terraced gardens.', '{vineyard,outdoor,destination}'::text[], '{"Valle de Guadalupe"}'::text[], NULL, NULL, NULL, NULL, NULL, NULL, 220, 'Ruta del Vino, BC');

    -- S&M venue engagements: presented (open proposal), shortlisted, quoted
    insert into public.wedding_vendors (wedding_id, vendor_id, status, presented_estimate, presented_at) values
      (sm, vin, 'presented', 240000, now() - interval '5 days') returning id into eng_pres;
    insert into public.event_vendors (engagement_id, event_id, wedding_id) values (eng_pres, sm_ceremony, sm), (eng_pres, sm_reception, sm);
    insert into public.proposals (wedding_id, status, title, note, estimate_amount, engagement_id, created_by, sent_at)
      values (sm, 'sent', 'Viñedo Santa Elena, venue', 'Terraced gardens, capacity 220.', 240000, eng_pres, planner, now() - interval '5 days') returning id into prop;

    insert into public.wedding_vendors (wedding_id, vendor_id, status, presented_estimate, presented_at) values
      (sm, olv, 'shortlisted', 260000, now() - interval '6 days') returning id into eng_short;
    insert into public.event_vendors (engagement_id, event_id, wedding_id) values (eng_short, sm_ceremony, sm);

    insert into public.wedding_vendors (wedding_id, vendor_id, status, presented_estimate, presented_at) values
      (sm, alm, 'quoted', 180000, now() - interval '7 days') returning id into eng_quoted;
    insert into public.event_vendors (engagement_id, event_id, wedding_id) values (eng_quoted, sm_reception, sm);
    insert into public.quotes (wedding_id, engagement_id, status, amount, valid_until, note)
      values (sm, eng_quoted, 'received', 18500, current_date + 30, 'Includes tax and service.') returning id into q;

    -- P&A: florist booked, linked to Sangeet (florals, no venue-rule impact)
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
