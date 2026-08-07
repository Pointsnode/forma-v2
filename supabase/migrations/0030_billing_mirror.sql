-- ═══ ADM-1 — the Stripe billing mirror ═══════════════════════════════════════
-- Extends the EXISTING M17 foundation (stripe_events + workspace_subscriptions +
-- the one webhook) — no parallel ingest. workspace_subscriptions is NOT touched.
-- The admin-owned billing_* tables are default-deny RLS, admin SELECT only, never
-- written by product code (the webhook writes them on the service role). All money
-- is stored in CENTS (Stripe's unit); no derived figure lives here.

-- ── stripe_events (from 0007) gains the raw payload + processing stamps, and its
-- deny-all policy is replaced by a platform-admin SELECT (the Audit/replay surface).
alter table public.stripe_events add column if not exists payload jsonb;
alter table public.stripe_events add column if not exists processed_at timestamptz;
alter table public.stripe_events add column if not exists error text;

drop policy if exists stripe_events_none on public.stripe_events;
drop policy if exists stripe_events_select on public.stripe_events;
create policy stripe_events_select on public.stripe_events for select to authenticated
  using (private.is_platform_admin());
-- No write policy → authenticated writes stay denied; the service-role webhook bypasses RLS.

-- ── Invoices. One row per Stripe invoice (the studio's own Forma subscription).
-- workspace_id is resolved from the invoice's subscription; nullable + on delete set
-- null so billing history survives a workspace deletion.
create table if not exists public.billing_invoices (
  stripe_invoice_id text primary key,
  workspace_id uuid references public.workspaces (id) on delete set null,
  status text,
  currency text,
  subtotal_cents bigint,
  discount_cents bigint,
  tax_cents bigint,
  total_cents bigint,
  amount_paid_cents bigint,
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  hosted_invoice_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Payments. One row per settled charge/PI. fee_cents is Stripe's fee (from the
-- balance transaction) so the accountant's NET is real, not derived at report time.
create table if not exists public.billing_payments (
  stripe_id text primary key,                                            -- charge or payment_intent id
  stripe_invoice_id text references public.billing_invoices (stripe_invoice_id) on delete set null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  amount_cents bigint,
  fee_cents bigint,
  net_cents bigint,
  status text,
  disputed boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Refunds. Append-only (a refund is terminal); no updated_at.
create table if not exists public.billing_refunds (
  stripe_refund_id text primary key,
  payment_id text references public.billing_payments (stripe_id) on delete set null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  amount_cents bigint,
  reason text,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── RLS: default-deny; single platform-admin SELECT each; NO client write policies.
alter table public.billing_invoices enable row level security;
drop policy if exists billing_invoices_select on public.billing_invoices;
create policy billing_invoices_select on public.billing_invoices for select to authenticated
  using (private.is_platform_admin());

alter table public.billing_payments enable row level security;
drop policy if exists billing_payments_select on public.billing_payments;
create policy billing_payments_select on public.billing_payments for select to authenticated
  using (private.is_platform_admin());

alter table public.billing_refunds enable row level security;
drop policy if exists billing_refunds_select on public.billing_refunds;
create policy billing_refunds_select on public.billing_refunds for select to authenticated
  using (private.is_platform_admin());

-- ── Every FK indexed (advisors), plus month-scan indexes for the reports/screens.
create index if not exists billing_invoices_workspace_idx on public.billing_invoices (workspace_id);
create index if not exists billing_invoices_paid_idx on public.billing_invoices (paid_at desc);
create index if not exists billing_payments_workspace_idx on public.billing_payments (workspace_id);
create index if not exists billing_payments_invoice_idx on public.billing_payments (stripe_invoice_id);
create index if not exists billing_payments_paid_idx on public.billing_payments (paid_at desc);
create index if not exists billing_refunds_workspace_idx on public.billing_refunds (workspace_id);
create index if not exists billing_refunds_payment_idx on public.billing_refunds (payment_id);
create index if not exists billing_refunds_refunded_idx on public.billing_refunds (refunded_at desc);

-- ── Touch triggers where updated_at exists (invoices + payments re-upsert across events).
drop trigger if exists touch_billing_invoices on public.billing_invoices;
create trigger touch_billing_invoices before update on public.billing_invoices for each row execute function private.touch_updated_at();
drop trigger if exists touch_billing_payments on public.billing_payments;
create trigger touch_billing_payments before update on public.billing_payments for each row execute function private.touch_updated_at();

-- ── Accounts reader. The platform admin cannot SELECT workspaces (member-only) or
-- workspace_subscriptions (owner-only, and must not be touched), so the Accounts screen
-- reads them through a DEFINER gated on is_platform_admin() — the M10 directory pattern.
-- No service role, no policy change on the product tables. One row per billing account
-- (a workspace with a subscription row), with its lifetime cash from the mirror.
create or replace function private.admin_accounts()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not private.is_platform_admin() then raise exception 'not permitted' using errcode = 'FV230'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'workspace_id', w.id,
      'name', w.name,
      'status', s.status,
      'current_period_end', s.current_period_end,
      'seats_snapshot', s.seats_snapshot,
      'started_at', w.created_at,
      'lifetime_cash_cents', coalesce(p.paid, 0)
    ) order by w.created_at desc)
    from public.workspace_subscriptions s
    join public.workspaces w on w.id = s.workspace_id
    left join (
      select workspace_id, sum(amount_cents) as paid
      from public.billing_payments where status = 'succeeded' group by workspace_id
    ) p on p.workspace_id = s.workspace_id
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_accounts()
  returns jsonb language sql security invoker set search_path = public as $$ select private.admin_accounts(); $$;

revoke execute on function private.admin_accounts(), public.admin_accounts() from public, anon;
grant execute on function private.admin_accounts(), public.admin_accounts() to authenticated;
