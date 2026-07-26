-- Demo loop — M2 showcase. STAGING ONLY, service-role, idempotent (fixed UUIDs +
-- on-conflict). Depends on demo_weddings.sql. Creates two demo couple accounts
-- (Priya, Sofía) as wedding_members so the threads have real authors, then seeds
-- proposals + threads + activity so the planner Overview, the couple inbox, and
-- the cockpit cards are alive on first login.
--
-- Proposal statuses/timestamps are set DIRECTLY here (service role, on INSERT so the
-- function-only status guard — a BEFORE UPDATE trigger — does not apply). That is
-- deliberate and demo-only; the app itself only ever moves status via the
-- lifecycle functions.

do $$
declare
  v_ws uuid;
  planner uuid;
  priya uuid := '0e300001-0000-4000-a000-000000000001';
  sofia uuid := '0e300002-0000-4000-a000-000000000002';
  pa uuid := 'd1a00001-0000-4000-a000-000000000001';  -- Priya & Arjun
  sm uuid := 'd1a00003-0000-4000-a000-000000000003';  -- Sofía & Marco
begin
  select id into v_ws from public.workspaces where name = 'Atelier Demo Studio' order by created_at limit 1;
  if v_ws is null then return; end if;
  select created_by into planner from public.workspaces where id = v_ws;
  if planner is null then select user_id into planner from public.workspace_members where workspace_id = v_ws limit 1; end if;

  -- demo couple accounts (trigger creates the profile) + names + memberships
  insert into auth.users (id, email) values (priya, 'priya-demo@forma.test'), (sofia, 'sofia-demo@forma.test')
    on conflict (id) do nothing;
  update public.profiles set display_name = 'Priya' where id = priya;
  update public.profiles set display_name = 'Sofía' where id = sofia;
  insert into public.wedding_members (wedding_id, user_id, role) values (pa, priya, 'partner'), (sm, sofia, 'partner')
    on conflict do nothing;

  -- ── P&A proposals ──────────────────────────────────────────────────────────
  -- 1. Floral concept — change_requested (couple's court), 2-message thread.
  insert into public.proposals (id, wedding_id, status, title, note, estimate_amount, event_ref, created_by, responded_by, sent_at, seen_at, responded_at, created_at)
  values ('0f100001-0000-4000-a000-000000000001', pa, 'change_requested', 'Floral concept — Bougainvillea & brass',
    'Brass structures with bougainvillea along the mandap and aisle.', 37000, 'd1a00001-0000-4000-a000-0000000000e3',
    planner, priya, now() - interval '4 days', now() - interval '3 days', now() - interval '2 days', now() - interval '5 days')
  on conflict (id) do nothing;
  insert into public.proposal_messages (id, proposal_id, wedding_id, author_id, body, created_at) values
    ('0f200001-0000-4000-a000-000000000001', '0f100001-0000-4000-a000-000000000001', pa, planner,
      'First boards for the florals — brass frames, bougainvillea kept structural. Estimate holds through the month.', now() - interval '4 days'),
    ('0f200002-0000-4000-a000-000000000002', '0f100001-0000-4000-a000-000000000001', pa, priya,
      'Love the brass and the structure. Can we go less orange, more blush? Thinking of the mandap photos at golden hour.', now() - interval '2 days')
  on conflict (id) do nothing;

  -- 2. Reception menu v2 — sent (couple's court), linked to Reception.
  insert into public.proposals (id, wedding_id, status, title, note, event_ref, created_by, sent_at, created_at)
  values ('0f100002-0000-4000-a000-000000000002', pa, 'sent', 'Reception menu v2 — tasting confirmed',
    'v2 folds in the tasting notes. One decision left: plated or family-style for the first course.',
    'd1a00001-0000-4000-a000-0000000000e5', planner, now() - interval '2 days', now() - interval '2 days')
  on conflict (id) do nothing;
  insert into public.proposal_messages (id, proposal_id, wedding_id, author_id, body, created_at) values
    ('0f200003-0000-4000-a000-000000000003', '0f100002-0000-4000-a000-000000000002', pa, planner,
      'Sea bass replaces the short rib and the late-night taco bar moves to 11pm. Plated or family-style for the first course?', now() - interval '2 days')
  on conflict (id) do nothing;

  -- 3. Mariachi final quote — sent (couple's court), linked to Welcome dinner.
  insert into public.proposals (id, wedding_id, status, title, note, estimate_amount, event_ref, created_by, sent_at, created_at)
  values ('0f100003-0000-4000-a000-000000000003', pa, 'sent', 'Mariachi Los Reyes — final quote',
    '45-minute set, including travel from Guadalajara. They hold the date until Aug 2.', 5600,
    'd1a00001-0000-4000-a000-0000000000e2', planner, now() - interval '4 days', now() - interval '4 days')
  on conflict (id) do nothing;

  -- 4. Sangeet DJ set list — approved (settled), linked to Sangeet.
  insert into public.proposals (id, wedding_id, status, title, note, event_ref, created_by, responded_by, sent_at, seen_at, responded_at, created_at)
  values ('0f100004-0000-4000-a000-000000000004', pa, 'approved', 'Sangeet DJ set list & sound rider',
    'DJ Selva — set list and sound rider for the Sangeet.', 'd1a00001-0000-4000-a000-0000000000e3',
    planner, priya, now() - interval '6 days', now() - interval '5 days', now() - interval '1 day', now() - interval '6 days')
  on conflict (id) do nothing;
  insert into public.proposal_messages (id, proposal_id, wedding_id, author_id, body, created_at) values
    ('0f200004-0000-4000-a000-000000000004', '0f100004-0000-4000-a000-000000000004', pa, priya,
      'Perfect. The bhangra block at midnight is non-negotiable.', now() - interval '1 day')
  on conflict (id) do nothing;

  -- ── S&M proposal — seen (couple's court) ────────────────────────────────────
  insert into public.proposals (id, wedding_id, status, title, note, event_ref, created_by, sent_at, seen_at, created_at)
  values ('0f100005-0000-4000-a000-000000000005', sm, 'seen', 'Venue shortlist — three finalists',
    'Three finalists in Valle de Guadalupe, with capacity and 2027 rates.', 'd1a00003-0000-4000-a000-0000000000e1',
    planner, now() - interval '3 days', now() - interval '1 day', now() - interval '3 days')
  on conflict (id) do nothing;

  -- ── Activity (couple-side actions light up "Since you were away") ────────────
  insert into public.activity (id, wedding_id, actor_id, verb, summary, subject, created_at) values
    ('0f300001-0000-4000-a000-000000000001', pa, priya, 'proposal_change_requested', 'Floral concept — Bougainvillea & brass', jsonb_build_object('proposal_id','0f100001-0000-4000-a000-000000000001'), now() - interval '2 days'),
    ('0f300002-0000-4000-a000-000000000002', pa, planner, 'proposal_sent', 'Reception menu v2 — tasting confirmed', jsonb_build_object('proposal_id','0f100002-0000-4000-a000-000000000002'), now() - interval '2 days'),
    ('0f300003-0000-4000-a000-000000000003', pa, priya, 'proposal_approved', 'Sangeet DJ set list & sound rider', jsonb_build_object('proposal_id','0f100004-0000-4000-a000-000000000004'), now() - interval '1 day'),
    ('0f300004-0000-4000-a000-000000000004', sm, sofia, 'proposal_seen', 'Venue shortlist — three finalists', jsonb_build_object('proposal_id','0f100005-0000-4000-a000-000000000005'), now() - interval '1 day')
  on conflict (id) do nothing;
end $$;
