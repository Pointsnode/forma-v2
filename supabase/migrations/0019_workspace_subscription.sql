-- 0019 — Studio subscription (M17, PR2: Part F). Additive only. One table the webhook
-- owns. The studio's OWN Forma subscription (the studio paying Forma for its seats) —
-- distinct from the planner-fee ledger (couples paying the planner). NO new anon
-- surface, NO new public function (the anon matrix stays exactly 10), NO couple/staff
-- RLS change. Reads are owner-scoped; every WRITE is service-role only (the webhook) —
-- there is no authenticated write policy, so RLS denies user writes by default.

create table if not exists public.workspace_subscriptions (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'none'
    check (status in ('active', 'past_due', 'canceled', 'trialing', 'incomplete', 'none')),
  current_period_end timestamptz,
  seats_snapshot jsonb, -- last-billed {accounts, additional, conciergeSeats, total}
  updated_at timestamptz not null default now()
);

create index if not exists workspace_subscriptions_sub_idx
  on public.workspace_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.workspace_subscriptions enable row level security;

-- Admins (the owner role ⟺ the admin box) read their own workspace's row. No insert /
-- update / delete policy exists → authenticated writes are denied; only the service-role
-- webhook writes. No grant to anon.
drop policy if exists workspace_subscriptions_select on public.workspace_subscriptions;
create policy workspace_subscriptions_select on public.workspace_subscriptions for select to authenticated
  using (private.is_workspace_owner(workspace_id));

drop trigger if exists touch_workspace_subscriptions on public.workspace_subscriptions;
create trigger touch_workspace_subscriptions before update on public.workspace_subscriptions
  for each row execute function private.touch_updated_at();
