-- 0015 vendor & venue ledger (M13). Additive, exactly four changes — it FINISHES the
-- quote loop already half-built in 0006, inventing nothing. No table dropped, no
-- column on vendors/wedding_vendors/event_vendors touched, NO new enum value, and NO
-- anon grant (the matrix stays exactly 10). The couple's only hand stays
-- respond_to_proposal; every status still moves through the function lane.

-- ── 1. A proposal may carry a specific quote ─────────────────────────────────
-- quote_id is NOT part of proposals_one_subject (event_ref/engagement_id/menu_id/
-- design_item_id) — it's a qualifier on an engagement proposal, not a subject — so
-- a quote proposal legally sets engagement_id AND quote_id.
alter table public.proposals add column if not exists quote_id uuid references public.quotes (id) on delete set null;
create index if not exists proposals_quote_id_idx on public.proposals (quote_id) where quote_id is not null;

-- ── 2. A revision loop is legal: 'quoted' joins request_quote's from-set ──────
-- Identical to 0006 except the from-set — so the planner can open a revised quote
-- straight from 'quoted' ("Record a revised quote"), and the couple's revision path
-- (via the trigger below) has a matching lane.
create or replace function private.request_quote(p_eng uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare w uuid; q uuid;
begin
  select wedding_id into w from public.wedding_vendors where id = p_eng;
  if w is null then raise exception 'no such engagement' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  perform private.set_engagement_status(p_eng, array['presented','shortlisted','quoted']::public.engagement_status[], 'quote_requested', 'quote_requested');
  insert into public.quotes (wedding_id, engagement_id, status) values (w, p_eng, 'requested') returning id into q;
  return q;
end $$;

-- ── 3. The couple's answer moves the quote as well as the engagement ─────────
-- The AFTER-UPDATE trigger runs in the COUPLE's session (auth.uid() = the couple),
-- so it must NOT call set_engagement_status — that helper's is_wedding_staff guard
-- would raise FV230 for the couple and abort respond_to_proposal. The existing
-- quote-less branch already sidesteps this with direct writes inside the eng_via_fn
-- guard; the quote branch mirrors that exactly (same observable transition + a verb),
-- which is what §2.3 prescribes in effect. Quote-less behaviour is byte-identical to 0006.
create or replace function private.on_engagement_proposal_responded()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.engagement_id is null then return new; end if;
  if new.status = old.status then return new; end if;

  if new.quote_id is null then
    -- IDENTICAL to 0006: a presentation proposal moves the engagement's first hop.
    perform set_config('forma.eng_via_fn', 'on', true);
    if new.status = 'approved' then
      update public.wedding_vendors set status = 'shortlisted' where id = new.engagement_id and status = 'presented';
    elsif new.status = 'declined' then
      update public.wedding_vendors set status = 'declined' where id = new.engagement_id and status = 'presented';
    end if;
    perform set_config('forma.eng_via_fn', 'off', true);
    return new;
  end if;

  -- A quote proposal: the couple's verdict moves the quote, and (for a revision or a
  -- decline) the engagement — on the couple's behalf, under the GUC, never via the
  -- staff-guarded helper.
  if new.status = 'approved' then
    update public.quotes set status = 'accepted' where id = new.quote_id;
    -- the engagement stays 'quoted' — booking is the planner's act, with the vendor
    perform private.log_activity(new.wedding_id, (select auth.uid()), 'quote_accepted', new.title, jsonb_build_object('engagement_id', new.engagement_id, 'quote_id', new.quote_id));
  elsif new.status = 'change_requested' then
    perform set_config('forma.eng_via_fn', 'on', true);
    update public.wedding_vendors set status = 'quote_requested' where id = new.engagement_id and status = 'quoted';
    perform set_config('forma.eng_via_fn', 'off', true);
    insert into public.quotes (wedding_id, engagement_id, status) values (new.wedding_id, new.engagement_id, 'requested');
    perform private.log_activity(new.wedding_id, (select auth.uid()), 'quote_revision_requested', new.title, jsonb_build_object('engagement_id', new.engagement_id, 'quote_id', new.quote_id));
  elsif new.status = 'declined' then
    update public.quotes set status = 'declined' where id = new.quote_id;
    perform set_config('forma.eng_via_fn', 'on', true);
    update public.wedding_vendors set status = 'declined'
      where id = new.engagement_id and status = any (array['presented','shortlisted','quote_requested','quoted']::public.engagement_status[]);
    perform set_config('forma.eng_via_fn', 'off', true);
    perform private.log_activity(new.wedding_id, (select auth.uid()), 'vendor_declined', new.title, jsonb_build_object('engagement_id', new.engagement_id, 'quote_id', new.quote_id));
  end if;
  return new;
end $$;
drop trigger if exists on_engagement_proposal_responded on public.proposals;
create trigger on_engagement_proposal_responded after update on public.proposals for each row execute function private.on_engagement_proposal_responded();

-- ── 4. send_quote — staff sends a recorded quote to the couple via the proposal
-- lane (the lane that is already theirs to answer). One transaction, logs activity.
create or replace function private.send_quote(p_quote uuid, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare q public.quotes; vname text; n int; pid uuid;
begin
  select * into q from public.quotes where id = p_quote;
  if not found then raise exception 'no such quote' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(q.wedding_id) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if q.amount is null then raise exception 'record the quote amount before sending it to the couple' using errcode = 'FV241'; end if;
  select v.name into vname from public.wedding_vendors wv join public.vendors v on v.id = wv.vendor_id where wv.id = q.engagement_id;
  -- N = the 1-based ordinal of this quote among the engagement's quotes by created_at
  select count(*) into n from public.quotes
    where engagement_id = q.engagement_id and (created_at < q.created_at or (created_at = q.created_at and id <= q.id));
  insert into public.proposals (wedding_id, status, title, note, estimate_amount, engagement_id, quote_id, created_by, sent_at)
    values (q.wedding_id, 'sent', vname || ' — Quote ' || n, p_note, q.amount, q.engagement_id, p_quote, (select auth.uid()), now())
    returning id into pid;
  perform private.log_activity(q.wedding_id, (select auth.uid()), 'quote_sent', vname, jsonb_build_object('engagement_id', q.engagement_id, 'quote_id', p_quote, 'proposal_id', pid));
  return pid;
end $$;

create or replace function public.send_quote(p_quote uuid, p_note text)
returns uuid language sql security invoker set search_path = public as $$ select private.send_quote(p_quote, p_note); $$;

revoke execute on function private.send_quote(uuid, text), public.send_quote(uuid, text) from public, anon;
grant execute on function private.send_quote(uuid, text), public.send_quote(uuid, text) to authenticated;
