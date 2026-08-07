-- ═══ ADM-4 — manual expenses + the accountant's actor lookup ══════════════════
-- A flat manual register (no bank feeds, no OCR, no accrual) so the income reports show a
-- true net and the accountant gets one export. Admin-owned: default-deny RLS, one
-- is_platform_admin() SELECT, ZERO client write policies. Owner-only CRUD via the established
-- DEFINER pattern; soft-void, never delete.

create table if not exists public.expense_entries (
  id uuid primary key default gen_random_uuid(),
  paid_on date not null,
  vendor text,
  category text not null check (category in ('infrastructure', 'tooling', 'services', 'fees', 'other')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD',
  memo text,
  receipt_url text,
  voided boolean not null default false,
  void_memo text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expense_entries enable row level security;
drop policy if exists expense_entries_select on public.expense_entries;
create policy expense_entries_select on public.expense_entries for select to authenticated using (private.is_platform_admin());

create index if not exists expense_entries_paid_on_idx on public.expense_entries (paid_on desc);
create index if not exists expense_entries_created_by_idx on public.expense_entries (created_by);

drop trigger if exists touch_expense_entries on public.expense_entries;
create trigger touch_expense_entries before update on public.expense_entries for each row execute function private.touch_updated_at();

-- ══ Owner-gated mutations (DEFINER + audit; soft-void, no delete). ══════════════
create or replace function private.admin_upsert_expense(p_id uuid, p_paid_on date, p_vendor text, p_category text, p_amount_cents bigint, p_currency text, p_memo text, p_receipt_url text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_before jsonb;
begin
  if not private.is_platform_owner() then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if coalesce(p_amount_cents, 0) <= 0 then raise exception 'the amount must be positive' using errcode = 'FV244'; end if;
  if p_id is null then
    insert into public.expense_entries (paid_on, vendor, category, amount_cents, currency, memo, receipt_url, created_by)
      values (p_paid_on, p_vendor, p_category, p_amount_cents, coalesce(p_currency, 'USD'), p_memo, p_receipt_url, auth.uid()) returning id into v_id;
    insert into public.admin_audit_log (actor_id, action, entity, entity_id, after)
      values (auth.uid(), 'expense.create', 'expense_entries', v_id::text, to_jsonb((select e from public.expense_entries e where e.id = v_id)));
  else
    select to_jsonb(e) into v_before from public.expense_entries e where e.id = p_id;
    if v_before is null then raise exception 'no such expense' using errcode = 'FV246'; end if;
    if (v_before->>'voided')::boolean then raise exception 'a voided expense cannot be edited' using errcode = 'FV247'; end if;
    update public.expense_entries set paid_on = p_paid_on, vendor = p_vendor, category = p_category, amount_cents = p_amount_cents,
      currency = coalesce(p_currency, currency), memo = p_memo, receipt_url = p_receipt_url where id = p_id;
    v_id := p_id;
    insert into public.admin_audit_log (actor_id, action, entity, entity_id, before, after)
      values (auth.uid(), 'expense.update', 'expense_entries', p_id::text, v_before, to_jsonb((select e from public.expense_entries e where e.id = p_id)));
  end if;
  return v_id;
end $$;

create or replace function private.admin_void_expense(p_id uuid, p_memo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not private.is_platform_owner() then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if coalesce(btrim(p_memo), '') = '' then raise exception 'a memo is required to void' using errcode = 'FV245'; end if;
  select to_jsonb(e) into v_before from public.expense_entries e where e.id = p_id;
  if v_before is null then raise exception 'no such expense' using errcode = 'FV246'; end if;
  update public.expense_entries set voided = true, void_memo = p_memo where id = p_id;
  insert into public.admin_audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'expense.void', 'expense_entries', p_id::text, v_before, to_jsonb((select e from public.expense_entries e where e.id = p_id)));
end $$;

-- Actor emails for the Audit screen — auth.users is not RLS-readable; a platform-admin-gated
-- DEFINER returns {user_id: email} for the given ids. Read-only.
create or replace function private.admin_actor_emails(p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not private.is_platform_admin() then raise exception 'not permitted' using errcode = 'FV230'; end if;
  return coalesce((select jsonb_object_agg(u.id::text, u.email) from auth.users u where u.id = any(p_ids)), '{}'::jsonb);
end $$;

-- Public (invoker) wrappers + grants (authenticated; the DEFINERs gate owner/admin).
create or replace function public.admin_upsert_expense(p_id uuid, p_paid_on date, p_vendor text, p_category text, p_amount_cents bigint, p_currency text, p_memo text, p_receipt_url text)
  returns uuid language sql security invoker set search_path = public as $$ select private.admin_upsert_expense(p_id, p_paid_on, p_vendor, p_category, p_amount_cents, p_currency, p_memo, p_receipt_url); $$;
create or replace function public.admin_void_expense(p_id uuid, p_memo text)
  returns void language sql security invoker set search_path = public as $$ select private.admin_void_expense(p_id, p_memo); $$;
create or replace function public.admin_actor_emails(p_ids uuid[])
  returns jsonb language sql security invoker set search_path = public as $$ select private.admin_actor_emails(p_ids); $$;

revoke execute on function
  private.admin_upsert_expense(uuid, date, text, text, bigint, text, text, text), private.admin_void_expense(uuid, text), private.admin_actor_emails(uuid[]),
  public.admin_upsert_expense(uuid, date, text, text, bigint, text, text, text), public.admin_void_expense(uuid, text), public.admin_actor_emails(uuid[])
  from public, anon;
grant execute on function
  private.admin_upsert_expense(uuid, date, text, text, bigint, text, text, text), private.admin_void_expense(uuid, text), private.admin_actor_emails(uuid[]),
  public.admin_upsert_expense(uuid, date, text, text, bigint, text, text, text), public.admin_void_expense(uuid, text), public.admin_actor_emails(uuid[])
  to authenticated;
