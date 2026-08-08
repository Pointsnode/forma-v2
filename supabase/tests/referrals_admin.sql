-- REF-2 — referral settlement: owner-only settle/reject, cash backstop, double-settle guard,
-- and reject-restores-balance proven by re-requesting the freed amount. Hermetic, fixture-scoped.

begin;

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'owner@test.forma'),
  ('10000000-0000-0000-0000-000000000002', 'padmin@test.forma'),
  ('10000000-0000-0000-0000-000000000003', 'member@test.forma');
insert into public.platform_admins (user_id, role) values
  ('10000000-0000-0000-0000-000000000001', 'owner'),
  ('10000000-0000-0000-0000-000000000002', 'partner');
insert into public.workspaces (id, kind, name, slug, created_by) values
  ('20000000-0000-0000-0000-000000000001', 'studio', 'Referrer', 'ws-r', '10000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000002', 'studio', 'Low', 'ws-low', '10000000-0000-0000-0000-000000000003');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'owner'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'owner');

-- WS R: $300 earned, two $50 bill redemptions requested (balance now $200).
insert into public.referral_credits (workspace_id, kind, source_ref, amount_cents) values ('20000000-0000-0000-0000-000000000001', 'credit', 'seed', 30000);
insert into public.referral_redemptions (id, workspace_id, kind, amount_cents, status, requested_by) values
  ('30000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'bill', 5000, 'requested', '10000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000001', 'bill', 5000, 'requested', '10000000-0000-0000-0000-000000000003');
insert into public.referral_credits (workspace_id, kind, source_ref, amount_cents) values
  ('20000000-0000-0000-0000-000000000001', 'redeem_bill', '30000000-0000-0000-0000-00000000000a', -5000),
  ('20000000-0000-0000-0000-000000000001', 'redeem_bill', '30000000-0000-0000-0000-00000000000b', -5000);
-- WS Low: $300 earned, one $200 CASH redemption requested (balance-at-request $300 < $500).
insert into public.referral_credits (workspace_id, kind, source_ref, amount_cents) values ('20000000-0000-0000-0000-000000000002', 'credit', 'seed', 30000);
insert into public.referral_redemptions (id, workspace_id, kind, amount_cents, status, requested_by) values
  ('30000000-0000-0000-0000-00000000000c', '20000000-0000-0000-0000-000000000002', 'cash', 20000, 'requested', '10000000-0000-0000-0000-000000000003');
insert into public.referral_credits (workspace_id, kind, source_ref, amount_cents) values ('20000000-0000-0000-0000-000000000002', 'redeem_cash', '30000000-0000-0000-0000-00000000000c', -20000);

-- Baseline: the member cannot re-request $250 now (balance is $200) — the freed amount matters.
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ declare ok boolean; begin
  begin perform public.request_redemption('20000000-0000-0000-0000-000000000001', 'bill', 25000); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: over-balance redemption was accepted'; end if;
end $$;

-- Role refusal: a platform partner cannot settle or reject.
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ declare ok boolean; begin
  begin perform public.admin_settle_redemption('30000000-0000-0000-0000-00000000000a', 'x'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: partner-role settled a redemption'; end if;
end $$;
do $$ declare ok boolean; begin
  begin perform public.admin_reject_redemption('30000000-0000-0000-0000-00000000000a', 'x'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: partner-role rejected a redemption'; end if;
end $$;

-- Owner actions.
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
-- Cash backstop: WS Low's balance at request ($300) is under $500 → refused.
do $$ declare ok boolean; begin
  begin perform public.admin_settle_redemption('30000000-0000-0000-0000-00000000000c', 'wire'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: cash settled under the $500 backstop'; end if;
end $$;
-- Settle bill A (no backstop), then a second settle is refused (double-settle guard).
do $$ begin
  perform public.admin_settle_redemption('30000000-0000-0000-0000-00000000000a', 'stripe-credit-1');
  if (select status from public.referral_redemptions where id = '30000000-0000-0000-0000-00000000000a') <> 'settled' then raise exception 'TEST FAIL: settle did not mark settled'; end if;
  if (select status from public.referral_credits where source_ref = '30000000-0000-0000-0000-00000000000a' and kind = 'redeem_bill') <> 'settled' then raise exception 'TEST FAIL: settle did not flip the debit'; end if;
end $$;
do $$ declare ok boolean; begin
  begin perform public.admin_settle_redemption('30000000-0000-0000-0000-00000000000a', 'again'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: a settled redemption was settled again'; end if;
end $$;
-- Reject bill B (memo required) → its debit is voided, restoring the balance.
do $$ declare ok boolean; begin
  begin perform public.admin_reject_redemption('30000000-0000-0000-0000-00000000000b', ''); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: reject accepted an empty memo'; end if;
end $$;
do $$ begin
  perform public.admin_reject_redemption('30000000-0000-0000-0000-00000000000b', 'duplicate request');
  if (select status from public.referral_credits where source_ref = '30000000-0000-0000-0000-00000000000b' and kind = 'redeem_bill') <> 'void' then raise exception 'TEST FAIL: reject did not void the debit'; end if;
  -- balance restored to $250 (300 - 50 settled A; B voided).
  if (select coalesce(sum(amount_cents), 0) from public.referral_credits where workspace_id = '20000000-0000-0000-0000-000000000001' and status <> 'void') <> 25000 then raise exception 'TEST FAIL: reject did not restore the balance'; end if;
end $$;

-- The freed amount is now redeemable: the member can request $250 where before it was refused.
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ begin
  if public.request_redemption('20000000-0000-0000-0000-000000000001', 'bill', 25000) is null then raise exception 'TEST FAIL: the freed amount was not redeemable after reject'; end if;
end $$;

rollback;
