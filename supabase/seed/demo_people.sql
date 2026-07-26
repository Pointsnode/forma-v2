-- Demo people — M3 showcase. STAGING ONLY, service-role, idempotent (seeds each
-- wedding's guests only if it has none). Depends on demo_weddings.sql. Emails are
-- plus-addressed to a real inbox so gate emails land somewhere clickable.
-- RSVP statuses / sent_at are set directly (demo-only); the app moves them only
-- through rsvp_submit / the cron.

do $$
declare
  pa uuid := 'd1a00001-0000-4000-a000-000000000001';   -- Priya & Arjun
  el uuid := 'd1a00002-0000-4000-a000-000000000002';   -- Emma & Lucas
  mehndi uuid := 'd1a00001-0000-4000-a000-0000000000e1';
  reminder_tp uuid;
  names text[] := array['Ananya Rao','Vikram Mehta','Rhea Kapoor','Arjun Nair','Priya Das','Kabir Singh','Isha Verma','Rohan Patel',
    'Meera Iyer','Dev Sharma','Nisha Reddy','Sameer Khan','Tara Bose','Aditya Jain','Kavya Menon','Yash Gupta',
    'Diya Malhotra','Neil Chopra','Sana Ahmed','Karan Bhat','Lila Fernandez','Omar Ruiz','Elena Cruz','Marco Diaz'];
  i int; gid uuid; g_yes int := 0;
begin
  -- ── Priya & Arjun: 24 guests ─────────────────────────────────────────────
  if (select count(*) from public.guests where wedding_id = pa) = 0 then
    for i in 1..24 loop
      insert into public.guests (wedding_id, full_name, email, side, group_label, plus_one_allowed)
      values (
        pa, names[i],
        case when i = 1 then null else 'advisory+g' || i || '@statusbitcoin.com' end,  -- guest 1: no email (exception)
        (array['a','b','both','a'])[1 + (i % 4)]::public.guest_side,
        (array['Family A','College','Bride''s side','Groom''s side'])[1 + (i % 4)],
        (i % 4 = 0)  -- every 4th allows a plus-one
      );
    end loop;

    -- Prune Mehndi to a subset: only the first 8 guests are at the Mehndi.
    update public.event_guests eg set invited = false
      where eg.event_id = mehndi
        and eg.guest_id in (select id from public.guests where wedding_id = pa order by full_name offset 8);

    -- ~14 guests have answered (mixed) — set their invited events.
    for gid in (select id from public.guests where wedding_id = pa order by full_name limit 14) loop
      g_yes := g_yes + 1;
      update public.event_guests
        set rsvp_status = (case when g_yes % 7 = 0 then 'no' when g_yes % 5 = 0 then 'maybe' else 'yes' end)::public.rsvp_status,
            rsvp_responded_at = now() - (g_yes || ' days')::interval
        where guest_id = gid and invited;
    end loop;

    -- Exception #2: exactly ONE plus-one-allowed guest who RSVP'd yes but left the
    -- +1 name blank. Everyone else who allows a +1 gets a name (no false exception).
    update public.guests set plus_one_allowed = true, plus_one_name = null
      where id = (select id from public.guests where wedding_id = pa order by full_name offset 3 limit 1);
    update public.event_guests set rsvp_status = 'yes', rsvp_responded_at = now() - interval '3 days'
      where guest_id = (select id from public.guests where wedding_id = pa order by full_name offset 3 limit 1) and invited;
    update public.guests set plus_one_name = 'Their guest'
      where wedding_id = pa and plus_one_allowed and (plus_one_name is null or plus_one_name = '')
        and id <> (select id from public.guests where wedding_id = pa order by full_name offset 3 limit 1);

    -- Open RSVP + set a deadline → seeds the timeline (invite / reminder / close).
    update public.weddings set rsvp_open = true, rsvp_deadline = current_date + 30 where id = pa;

    -- Mark the invite touchpoint 'sent' with a send row per emailed guest (most answered).
    update public.touchpoints set status = 'sent', scheduled_for = current_date - 20 where wedding_id = pa and kind = 'rsvp_invite';
    insert into public.touchpoint_sends (touchpoint_id, guest_id, wedding_id, sent_at, answered_at)
      select t.id, g.id, pa, now() - interval '20 days',
        case when exists (select 1 from public.event_guests eg where eg.guest_id = g.id and eg.invited and eg.rsvp_status <> 'pending') then now() - interval '2 days' else null end
      from public.touchpoints t, public.guests g
      where t.wedding_id = pa and t.kind = 'rsvp_invite' and g.wedding_id = pa and g.email is not null
      on conflict do nothing;

    -- Exception #3: an unanswered rsvp_reminder send (sent, never answered).
    select id into reminder_tp from public.touchpoints where wedding_id = pa and kind = 'rsvp_reminder';
    insert into public.touchpoint_sends (touchpoint_id, guest_id, wedding_id, sent_at, answered_at)
      select reminder_tp,
        (select id from public.guests where wedding_id = pa and email is not null
           and not exists (select 1 from public.event_guests eg where eg.guest_id = guests.id and eg.invited and eg.rsvp_status <> 'pending')
         order by full_name limit 1),
        pa, now() - interval '1 day', null
      on conflict do nothing;

    insert into public.activity (wedding_id, actor_id, verb, summary, created_at) values
      (pa, null, 'list_imported', '24 guests', now() - interval '20 days'),
      (pa, null, 'guest_rsvpd', 'Ananya Rao', now() - interval '2 days'),
      (pa, null, 'guest_rsvpd', 'Vikram Mehta', now() - interval '3 days');
  end if;

  -- ── Emma & Lucas: 8 guests, RSVP NOT opened (pre-deadline empty state) ────
  if (select count(*) from public.guests where wedding_id = el) = 0 then
    for i in 1..8 loop
      insert into public.guests (wedding_id, full_name, email)
      values (el, (array['Sofia Reyes','Mateo Luna','Camila Ortiz','Diego Flores','Valeria Cruz','Nicolas Vega','Lucia Mora','Emilio Castro'])[i], 'advisory+e' || i || '@statusbitcoin.com');
    end loop;
  end if;
end $$;
