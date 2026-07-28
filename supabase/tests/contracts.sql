-- 0007 money & contracts — signing suite (order/immutability/value-freeze/FM025),
-- Phase-1 gate matrix, draft-hold both directions, ledger trace + accept_quote,
-- cross-wedding composite rejections. begin;…rollback; hermetic.
begin;

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','staff@test.forma'),
  ('22222222-0000-0000-0000-000000000002','approver@test.forma'),
  ('33333333-0000-0000-0000-000000000003','couple@test.forma');  -- onboarded by the gate
insert into public.profiles (id, display_name) values
  ('11111111-0000-0000-0000-000000000001','Gio M'),
  ('22222222-0000-0000-0000-000000000002','Danielle C') on conflict do nothing;

insert into public.workspaces (id, kind, name, slug, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1','studio','Atelier','atelier','11111111-0000-0000-0000-000000000001');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001','owner');

-- W1 in hiring (the Phase-1 subject); W2 for the negative cell + cross-wedding
insert into public.weddings (id, workspace_id, slug, couple_display, kind, phase) values
  ('cccccccc-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-0000000000a1','w1','Danielle & Cruz','destination','hiring'),
  ('cccccccc-0000-0000-0000-0000000000c2','aaaaaaaa-0000-0000-0000-0000000000a1','w2','Other Pair','city','hiring');
insert into public.wedding_members (wedding_id, user_id, role) values
  ('cccccccc-0000-0000-0000-0000000000c1','22222222-0000-0000-0000-000000000002','partner');

-- a venue engagement + received quote on W1 (for accept_quote → ledger line)
insert into public.vendors (id, workspace_id, name, kind) values
  ('d0000000-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1','Hacienda Uno','venue');
insert into public.wedding_vendors (id, wedding_id, vendor_id, status) values
  ('e0000000-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-0000000000c1','d0000000-0000-0000-0000-0000000000f1','quoted');
insert into public.quotes (id, wedding_id, engagement_id, status, amount) values
  ('90000000-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-0000000000c1','e0000000-0000-0000-0000-0000000000a1','received', 5000);

-- planner agreement (draft) + its content, fields, signers, deposit line
insert into public.contracts (id, wedding_id, kind, status, title) values
  ('c0117ac0-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-0000000000c1','planner_agreement','draft','Full planning agreement');
insert into public.contract_draft_content (contract_id, body) values ('c0117ac0-0000-0000-0000-0000000000a1','This agreement is between {couple_names} and Atelier.');
insert into public.contract_fields (id, contract_id, merge_source, field_key, label, signer_order, required, sort) values
  ('f1e1d000-0000-0000-0000-0000000000a1','c0117ac0-0000-0000-0000-0000000000a1','couple_names','couple_names','Clients', null, false, 0),
  ('f1e1d000-0000-0000-0000-0000000000a2','c0117ac0-0000-0000-0000-0000000000a1','manual','couple_initials','Initials', 1, true, 1);
-- explicit tokens (real signers get these by email; RLS hides them from queries)
insert into public.contract_signers (id, contract_id, sign_order, role, name, email, token) values
  ('516e0000-0000-0000-0000-0000000000a1','c0117ac0-0000-0000-0000-0000000000a1',1,'couple','Danielle','couple@test.forma','sign1sign1sign1sign1sig1'),
  ('516e0000-0000-0000-0000-0000000000a2','c0117ac0-0000-0000-0000-0000000000a1',2,'planner','Gio', null,'sign2sign2sign2sign2sig2');
insert into public.ledger_lines (id, wedding_id, title, amount, status, kind, contract_id) values
  ('1ed00000-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-0000000000c1','Planner fee — deposit', 9500, 'due', 'planner_fee', 'c0117ac0-0000-0000-0000-0000000000a1');

-- a change-requested proposal + a florals contract held on it (draft-hold)
insert into public.proposals (id, wedding_id, status, title, created_by) values
  ('9209b000-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-0000000000c1','sent','Floral concept','11111111-0000-0000-0000-000000000001');
insert into public.contracts (id, wedding_id, kind, status, title, blocking_proposal_id) values
  ('c0117ac0-0000-0000-0000-0000000000b1','cccccccc-0000-0000-0000-0000000000c1','vendor','draft','Florals agreement','9209b000-0000-0000-0000-0000000000a1');
insert into public.contract_signers (contract_id, sign_order, role, name, email) values
  ('c0117ac0-0000-0000-0000-0000000000b1',1,'vendor','Flor y Canto','flor@test.forma');

-- ── (1) accept_quote lays down its expected ledger line, fully traced ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  perform public.accept_quote('90000000-0000-0000-0000-0000000000a1');
  if (select count(*) from public.ledger_lines where quote_id='90000000-0000-0000-0000-0000000000a1' and kind='balance' and status='expected') <> 1 then
    raise exception 'TEST FAIL: accept_quote did not create a traced ledger line'; end if;
end $$;

-- ── (2) draft-hold: a held contract cannot be sent ───────────────────────────
do $$ begin
  begin perform public.send_contract('c0117ac0-0000-0000-0000-0000000000b1', '{}'::jsonb);
    raise exception 'TEST FAIL: sent a draft-held contract';
  exception when sqlstate 'FM022' then null; end;
end $$;

-- ── (3) draft-hold, other direction: approving the proposal auto-sends ────────
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  perform public.mark_proposal_seen('9209b000-0000-0000-0000-0000000000a1');
  perform public.respond_to_proposal('9209b000-0000-0000-0000-0000000000a1','approve',null);
  if (select status from public.contracts where id='c0117ac0-0000-0000-0000-0000000000b1') <> 'sent' then
    raise exception 'TEST FAIL: approving the proposal did not auto-send the held contract'; end if;
end $$;

-- ── (4) send the planner agreement + signing ceremony ────────────────────────
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  perform public.send_contract('c0117ac0-0000-0000-0000-0000000000a1', jsonb_build_object('couple_names','Danielle & Cruz'));
  if (select resolved_value from public.contract_fields where id='f1e1d000-0000-0000-0000-0000000000a1') <> 'Danielle & Cruz' then
    raise exception 'TEST FAIL: merge value not snapshot at send'; end if;
end $$;

-- signer surface is anonymous (writes as anon; the status READS reset role, since
-- contracts are invisible to anon under RLS — a read as anon would false-pass null)
set local role anon;
set local request.jwt.claims = '';
-- order gate: signer 2 cannot go before signer 1
do $$ begin
  begin perform public.sign_contract_as('sign2sign2sign2sign2sig2', 'Gio');
    raise exception 'TEST FAIL: out-of-order signature accepted';
  exception when sqlstate 'FM021' then null; end;
end $$;
-- required-field gate, fill, sign signer 1, then immutability (all as anon)
do $$ begin
  begin perform public.sign_contract_as('sign1sign1sign1sign1sig1', 'Danielle');
    raise exception 'TEST FAIL: signed with a required field unfilled';
  exception when sqlstate 'FM025' then null; end;
  perform public.fill_contract_fields_as('sign1sign1sign1sign1sig1', jsonb_build_object('couple_initials','DC'));
  perform public.sign_contract_as('sign1sign1sign1sign1sig1', 'Danielle Cruz');
  begin perform public.sign_contract_as('sign1sign1sign1sign1sig1', 'again');
    raise exception 'TEST FAIL: signer re-acted';
  exception when sqlstate 'FM024' then null; end;
end $$;
reset role;
do $$ begin
  if (select status from public.contracts where id='c0117ac0-0000-0000-0000-0000000000a1') <> 'partially_signed' then
    raise exception 'TEST FAIL: contract not partially_signed after signer 1'; end if;
end $$;

-- ── (5) last signer completes; deposit still UNPAID → the gate holds ─────────
set local role anon;
set local request.jwt.claims = '';
do $$ begin perform public.sign_contract_as('sign2sign2sign2sign2sig2', 'Gio M'); end $$;
reset role;
do $$ begin
  if (select status from public.contracts where id='c0117ac0-0000-0000-0000-0000000000a1') <> 'completed' then
    raise exception 'TEST FAIL: contract not completed after last signer'; end if;
  if (select artifact_path from public.contracts where id='c0117ac0-0000-0000-0000-0000000000a1') is null then
    raise exception 'TEST FAIL: completion did not stamp artifact_path (the copy-filed promise)'; end if;
  if (select phase from public.weddings where id='cccccccc-0000-0000-0000-0000000000c1') <> 'hiring' then
    raise exception 'TEST FAIL: phase advanced on completion before the deposit was paid'; end if;
  if exists (select 1 from public.wedding_members where wedding_id='cccccccc-0000-0000-0000-0000000000c1' and user_id='33333333-0000-0000-0000-000000000003') then
    raise exception 'TEST FAIL: couple membership created before payment'; end if;
end $$;

-- value-freeze: the merge value cannot change once completed
reset role;
do $$ begin
  begin update public.contract_fields set resolved_value = 'Someone Else' where id='f1e1d000-0000-0000-0000-0000000000a1';
    raise exception 'TEST FAIL: edited a frozen contract value';
  exception when sqlstate 'FM026' then null; end;
end $$;

-- ── (6) pay the deposit → gate fires: membership + phase 1→2 ──────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  update public.ledger_lines set status='paid', paid_at=now() where id='1ed00000-0000-0000-0000-0000000000a1';
  if (select phase from public.weddings where id='cccccccc-0000-0000-0000-0000000000c1') <> 'foundations' then
    raise exception 'TEST FAIL: phase did not advance 1→2 on complete+paid'; end if;
  if not exists (select 1 from public.wedding_members where wedding_id='cccccccc-0000-0000-0000-0000000000c1' and user_id='33333333-0000-0000-0000-000000000003') then
    raise exception 'TEST FAIL: matched-email couple not made a member'; end if;
end $$;

-- ── (7) Phase-1 negative: paid deposit but INCOMPLETE contract → nothing ─────
insert into public.contracts (id, wedding_id, kind, status, title) values
  ('c0117ac0-0000-0000-0000-0000000000c1','cccccccc-0000-0000-0000-0000000000c2','planner_agreement','draft','W2 agreement');
insert into public.ledger_lines (id, wedding_id, title, amount, status, kind, contract_id) values
  ('1ed00000-0000-0000-0000-0000000000c1','cccccccc-0000-0000-0000-0000000000c2','Deposit', 1000, 'due', 'planner_fee', 'c0117ac0-0000-0000-0000-0000000000c1');
do $$ begin
  update public.ledger_lines set status='paid' where id='1ed00000-0000-0000-0000-0000000000c1';
  if (select phase from public.weddings where id='cccccccc-0000-0000-0000-0000000000c2') <> 'hiring' then
    raise exception 'TEST FAIL: phase advanced with an incomplete contract'; end if;
end $$;

-- ── (8) cross-wedding composite rejections ───────────────────────────────────
do $$ begin
  begin insert into public.ledger_lines (wedding_id, title, amount, kind, contract_id)
    values ('cccccccc-0000-0000-0000-0000000000c2','x', 1, 'manual', 'c0117ac0-0000-0000-0000-0000000000a1');  -- W1's contract under W2
    raise exception 'TEST FAIL: ledger line accepted a cross-wedding contract_id';
  exception when foreign_key_violation then null; end;
  begin insert into public.contracts (wedding_id, kind, status, title, engagement_id)
    values ('cccccccc-0000-0000-0000-0000000000c2','venue','draft','x','e0000000-0000-0000-0000-0000000000a1');  -- W1's engagement under W2
    raise exception 'TEST FAIL: contract accepted a cross-wedding engagement_id';
  exception when foreign_key_violation then null; end;
end $$;

-- ── (9) 0009 guards: status is function-only; a new contract is born a draft ──
-- The proven hole: a plain staff UPDATE flipping status must now be rejected.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  -- direct status write by staff → FM028 (the guard). 'b1' is 'sent' at this point.
  begin update public.contracts set status = 'completed' where id = 'c0117ac0-0000-0000-0000-0000000000b1';
    raise exception 'TEST FAIL: direct status write bypassed the guard';
  exception when sqlstate 'FM028' then null; end;
  -- a completed contract is untouched by the failed write
  if (select status from public.contracts where id = 'c0117ac0-0000-0000-0000-0000000000a1') <> 'completed' then
    raise exception 'TEST FAIL: completed contract mutated'; end if;
  -- direct insert at a non-draft status → FM029 (insert guard)
  begin insert into public.contracts (wedding_id, kind, status, title)
    values ('cccccccc-0000-0000-0000-0000000000c1','vendor','completed','Sneaky pre-signed');
    raise exception 'TEST FAIL: inserted a non-draft contract';
  exception when sqlstate 'FM029' then null; end;
  -- a legitimate draft insert still lands (the create leg's shape)
  insert into public.contracts (id, wedding_id, kind, status, title)
    values ('c0117ac0-0000-0000-0000-0000000000e9','cccccccc-0000-0000-0000-0000000000c1','vendor','draft','Created via UI');
end $$;

-- ── (10) contract_created activity: the UI-shape create logs an audit row ─────
do $$ begin
  perform public.log_contract_created('c0117ac0-0000-0000-0000-0000000000e9');
  if not exists (select 1 from public.activity where verb = 'contract_created'
      and (subject->>'contract_id') = 'c0117ac0-0000-0000-0000-0000000000e9') then
    raise exception 'TEST FAIL: contract_created activity not logged'; end if;
end $$;

-- (sections 4–5 already prove the flag-wrapped lifecycle sends→signs→completes.)

reset role;
select 'contracts: ALL TESTS PASSED' as result;
rollback;
