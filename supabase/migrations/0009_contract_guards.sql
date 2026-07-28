-- 0009 contract guards — close the direct-status-write hole the Studio Contracts
-- PR exposed. Now that the UI legitimately points writes at `contracts`, the
-- function-only status invariant must be enforced at the DB, not assumed.
--
-- Pattern mirrors the M2 proposals guard (0003 §guard_proposal_status): the
-- lifecycle DEFINER functions set forma.status_via_fn='on' around their status
-- write; the trigger rejects any status change made without the flag. A BEFORE
-- INSERT guard additionally forces new contracts to land as 'draft' — the same
-- flag lets fixtures (tests/seed) plant already-progressed contracts.
--
-- Deviation 3 (activity) rides along, but only where it has a home: contract_created
-- is wedding-scoped and renders in the room audit trail + cockpit feed. Template
-- activity is intentionally NOT logged — activity.wedding_id is NOT NULL and both
-- readers are wedding-scoped, so template events have no column to live in and no
-- surface to render on; that needs workspace-scoped activity infra (a follow-up),
-- not a guard migration.

-- ── status guard: only the lifecycle functions may change status ─────────────
create or replace function private.guard_contract_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('forma.status_via_fn', true), '') <> 'on' then
    raise exception 'contract status changes go through the lifecycle functions' using errcode = 'FM028';
  end if;
  return new;
end $$;
drop trigger if exists guard_contract_status on public.contracts;
create trigger guard_contract_status before update on public.contracts for each row execute function private.guard_contract_status();

-- ── insert guard: a contract is born a draft (flag lets fixtures plant others) ─
create or replace function private.guard_contract_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status <> 'draft'
     and coalesce(current_setting('forma.status_via_fn', true), '') <> 'on' then
    raise exception 'a new contract must start as a draft' using errcode = 'FM029';
  end if;
  return new;
end $$;
drop trigger if exists guard_contract_insert on public.contracts;
create trigger guard_contract_insert before insert on public.contracts for each row execute function private.guard_contract_insert();

-- ── lifecycle functions re-declared with the flag around their status writes ──
-- Bodies are verbatim from 0007 except for the set_config('forma.status_via_fn')
-- window bracketing each `update contracts set status = …`.
create or replace function private.do_send_contract(p_contract uuid, p_resolved jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contracts; k text; val text; blk public.proposal_status;
begin
  select * into c from public.contracts where id = p_contract for update;
  if not found then raise exception 'no such contract' using errcode = 'FV000'; end if;
  if c.status <> 'draft' then raise exception 'only a draft can be sent' using errcode = 'FM027'; end if;
  if c.blocking_proposal_id is not null then
    select status into blk from public.proposals where id = c.blocking_proposal_id;
    if blk is distinct from 'approved' then
      raise exception 'contract is held until its proposal is approved' using errcode = 'FM022';
    end if;
  end if;
  if not exists (select 1 from public.contract_signers where contract_id = p_contract) then
    raise exception 'a contract needs at least one signer' using errcode = 'FM025';
  end if;
  for k, val in select * from jsonb_each_text(coalesce(p_resolved, '{}'::jsonb)) loop
    update public.contract_fields set resolved_value = val where contract_id = p_contract and field_key = k;
  end loop;
  perform set_config('forma.status_via_fn', 'on', true);
  update public.contracts set status = 'sent' where id = p_contract;
  perform set_config('forma.status_via_fn', 'off', true);
  perform private.log_activity(c.wedding_id, (select auth.uid()), 'contract_sent', c.title, jsonb_build_object('contract_id', p_contract));
end $$;

create or replace function private.void_contract(p_contract uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = p_contract for update;
  if not found then raise exception 'no such contract' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(c.wedding_id) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if c.status = 'completed' then raise exception 'a completed contract cannot be voided' using errcode = 'FM027'; end if;
  perform set_config('forma.status_via_fn', 'on', true);
  update public.contracts set status = 'voided' where id = p_contract;
  perform set_config('forma.status_via_fn', 'off', true);
  perform private.log_activity(c.wedding_id, (select auth.uid()), 'contract_voided', c.title, jsonb_build_object('contract_id', p_contract));
end $$;

create or replace function private.sign_contract_as(p_token text, p_typed_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.contract_signers; c public.contracts; cur int; missing int; remaining int;
begin
  s := private.signer_from_token(p_token);
  select * into c from public.contracts where id = s.contract_id for update;
  if c.status not in ('sent','partially_signed') then raise exception 'contract is not open for signing' using errcode = 'FM027'; end if;
  if s.signed_at is not null or s.declined_at is not null then raise exception 'you have already acted' using errcode = 'FM024'; end if;
  select min(sign_order) into cur from public.contract_signers where contract_id = c.id and signed_at is null and declined_at is null;
  if cur is distinct from s.sign_order then raise exception 'it is not your turn' using errcode = 'FM021'; end if;
  if p_typed_name is null or length(btrim(p_typed_name)) = 0 then raise exception 'a signature is required' using errcode = 'FM025'; end if;
  select count(*) into missing from public.contract_fields f
    where f.contract_id = c.id and f.required
      and coalesce(f.signer_order, s.sign_order) = s.sign_order
      and coalesce(nullif(btrim(coalesce(f.manual_value, f.resolved_value, '')), ''), null) is null;
  if missing > 0 then raise exception '% required field(s) unfilled', missing using errcode = 'FM025'; end if;

  update public.contract_signers set signed_at = now(), typed_name = p_typed_name where id = s.id;
  select count(*) into remaining from public.contract_signers where contract_id = c.id and signed_at is null and declined_at is null;
  perform set_config('forma.status_via_fn', 'on', true);
  if remaining = 0 then
    update public.contracts set status = 'completed', completed_at = now(),
      artifact_path = concat(c.wedding_id, '/', c.id, '.html')
      where id = c.id;
  else
    update public.contracts set status = 'partially_signed' where id = c.id;
  end if;
  perform set_config('forma.status_via_fn', 'off', true);
  perform private.log_activity(c.wedding_id, null, 'contract_signed', s.name, jsonb_build_object('contract_id', c.id));
  return jsonb_build_object('completed', remaining = 0, 'remaining', remaining);
end $$;

create or replace function private.decline_contract_as(p_token text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.contract_signers; c public.contracts;
begin
  s := private.signer_from_token(p_token);
  select * into c from public.contracts where id = s.contract_id for update;
  if c.status not in ('sent','partially_signed') then raise exception 'contract is not open' using errcode = 'FM027'; end if;
  if s.signed_at is not null or s.declined_at is not null then raise exception 'you have already acted' using errcode = 'FM024'; end if;
  update public.contract_signers set declined_at = now(), decline_reason = p_reason where id = s.id;
  perform set_config('forma.status_via_fn', 'on', true);
  update public.contracts set status = 'declined' where id = c.id;
  perform set_config('forma.status_via_fn', 'off', true);
  perform private.log_activity(c.wedding_id, null, 'contract_declined', s.name, jsonb_build_object('contract_id', c.id));
end $$;

-- ── contract_created activity (wedding-scoped; renders in room audit + feed) ──
create or replace function private.log_contract_created(p_contract uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = p_contract;
  if not found then raise exception 'no such contract' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(c.wedding_id) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  perform private.log_activity(c.wedding_id, (select auth.uid()), 'contract_created', c.title, jsonb_build_object('contract_id', p_contract));
end $$;

create or replace function public.log_contract_created(p_contract uuid)
returns void language sql security invoker set search_path = public as $$
  select private.log_contract_created(p_contract);
$$;

-- ═══ Grants (§11) ════════════════════════════════════════════════════════════
-- trigger functions are never called directly
revoke execute on function private.guard_contract_status(), private.guard_contract_insert()
  from public, anon, authenticated;
-- contract_created writer: staff/authenticated entry point (invoker wrapper needs
-- execute on the private definer too)
revoke execute on function private.log_contract_created(uuid), public.log_contract_created(uuid)
  from public, anon;
grant execute on function private.log_contract_created(uuid), public.log_contract_created(uuid)
  to authenticated;
