-- ADM-1 — billing mirror isolation (both directions) + default-deny writes + webhook
-- idempotency. Hermetic (PGlite), fixture-scoped, begin; … rollback;.
--   (a) a tenant user (any workspace role) reads ZERO billing/event rows;
--   (b) a platform admin reads the seeded rows (cross-workspace);
--   plus: billing_* + stripe_events are default-deny for client writes; a replayed
--   Stripe event id conflicts on the PK (the webhook's no-op guard).

begin;

-- ── Fixtures, all on the service/owner path (superuser here, as the webhook's service
-- role would be — there is NO client write policy on any of these tables).
insert into auth.users (id, email) values
  ('ffff0001-0000-0000-0000-0000000000f1', 'padmin@test.forma'),   -- platform owner
  ('ffff0002-0000-0000-0000-0000000000f2', 'tenant@test.forma');   -- plain tenant user

insert into public.platform_admins (user_id, role) values ('ffff0001-0000-0000-0000-0000000000f1', 'owner');

insert into public.workspaces (id, kind, name, slug, created_by)
  values ('ffff0003-0000-0000-0000-0000000000f3', 'studio', 'WS', 'ws-adm1', 'ffff0002-0000-0000-0000-0000000000f2');
insert into public.workspace_members (workspace_id, user_id, role)
  values ('ffff0003-0000-0000-0000-0000000000f3', 'ffff0002-0000-0000-0000-0000000000f2', 'owner');
insert into public.workspace_subscriptions (workspace_id, stripe_customer_id, stripe_subscription_id, status, seats_snapshot)
  values ('ffff0003-0000-0000-0000-0000000000f3', 'cus_test', 'sub_test', 'active', '{"total":79}'::jsonb);

insert into public.billing_invoices (stripe_invoice_id, workspace_id, status, currency, total_cents, amount_paid_cents)
  values ('in_test_1', 'ffff0003-0000-0000-0000-0000000000f3', 'paid', 'usd', 7900, 7900);
insert into public.billing_payments (stripe_id, stripe_invoice_id, workspace_id, amount_cents, fee_cents, net_cents, status)
  values ('py_test_1', 'in_test_1', 'ffff0003-0000-0000-0000-0000000000f3', 7900, 259, 7641, 'succeeded');
insert into public.billing_refunds (stripe_refund_id, payment_id, workspace_id, amount_cents, reason)
  values ('re_test_1', 'py_test_1', 'ffff0003-0000-0000-0000-0000000000f3', 500, 'requested_by_customer');
insert into public.stripe_events (id, type, payload) values ('evt_test_1', 'invoice.paid', '{"id":"evt_test_1"}'::jsonb);

-- Webhook idempotency: a replayed event id conflicts on the PK (superuser bypasses RLS,
-- but the primary key still rejects the duplicate — the no-op guard).
do $$ declare ok boolean; begin
  begin insert into public.stripe_events (id, type) values ('evt_test_1', 'invoice.paid'); ok := true;
  exception when unique_violation then ok := false; end;
  if ok then raise exception 'TEST FAIL: duplicate stripe_event id did not conflict'; end if;
end $$;

-- (a) The tenant user reads ZERO billing/event rows, and cannot write.
set local role authenticated;
set local request.jwt.claims = '{"sub":"ffff0002-0000-0000-0000-0000000000f2","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.billing_invoices where stripe_invoice_id = 'in_test_1') <> 0 then raise exception 'TEST FAIL: tenant reads billing_invoices'; end if;
  if (select count(*) from public.billing_payments where stripe_id = 'py_test_1') <> 0 then raise exception 'TEST FAIL: tenant reads billing_payments'; end if;
  if (select count(*) from public.billing_refunds where stripe_refund_id = 're_test_1') <> 0 then raise exception 'TEST FAIL: tenant reads billing_refunds'; end if;
  if (select count(*) from public.stripe_events where id = 'evt_test_1') <> 0 then raise exception 'TEST FAIL: tenant reads stripe_events'; end if;
end $$;
do $$ declare ok boolean; begin
  begin insert into public.billing_payments (stripe_id, workspace_id, amount_cents) values ('py_hack', 'ffff0003-0000-0000-0000-0000000000f3', 1); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: tenant client-wrote billing_payments'; end if;
end $$;
-- The accounts DEFINER refuses a non-admin (the workspace owner is not a platform admin).
do $$ declare ok boolean; begin
  begin perform public.admin_accounts(); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: tenant reached admin_accounts()'; end if;
end $$;

-- (b) The platform admin reads the seeded rows (cross-workspace), and still cannot write.
set local request.jwt.claims = '{"sub":"ffff0001-0000-0000-0000-0000000000f1","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.billing_invoices where stripe_invoice_id = 'in_test_1') <> 1 then raise exception 'TEST FAIL: admin cannot read billing_invoices'; end if;
  if (select count(*) from public.billing_payments where stripe_id = 'py_test_1') <> 1 then raise exception 'TEST FAIL: admin cannot read billing_payments'; end if;
  if (select count(*) from public.billing_refunds where stripe_refund_id = 're_test_1') <> 1 then raise exception 'TEST FAIL: admin cannot read billing_refunds'; end if;
  if (select count(*) from public.stripe_events where id = 'evt_test_1') <> 1 then raise exception 'TEST FAIL: admin cannot read stripe_events'; end if;
end $$;
do $$ declare ok boolean; begin
  begin insert into public.billing_invoices (stripe_invoice_id) values ('in_hack'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: admin client-wrote billing_invoices'; end if;
end $$;
-- The accounts DEFINER returns the one fixture account (name + lifetime cash from the mirror).
do $$ declare accts jsonb; begin
  accts := public.admin_accounts();
  if jsonb_array_length(accts) <> 1 then raise exception 'TEST FAIL: admin_accounts returned % rows', jsonb_array_length(accts); end if;
  if accts->0->>'name' <> 'WS' then raise exception 'TEST FAIL: admin_accounts name wrong (%)', accts->0->>'name'; end if;
  if (accts->0->>'lifetime_cash_cents')::bigint <> 7900 then raise exception 'TEST FAIL: admin_accounts lifetime cash wrong (%)', accts->0->>'lifetime_cash_cents'; end if;
end $$;

rollback;
