-- Demo money & contracts — M5 showcase. STAGING ONLY, service-role, idempotent.
-- Danielle & Cruz (the lead, phase hiring) carries the Phase-1 story: a draft
-- planner agreement + $9,500 deposit awaiting signature & payment. P&A gets the
-- money-radar ledger lines + a florals contract held on the change-requested
-- proposal (draft-hold renders true). S&M gets a venue contract draft on Casa Alma.
do $$
declare
  v_ws uuid := '6dd03946-8121-4894-bbc5-34a8257a5548';
  planner uuid := 'feabba08-86fd-4e68-a71b-93d42c3bd405';
  pa uuid := 'd1a00001-0000-4000-a000-000000000001';
  sm uuid := 'd1a00003-0000-4000-a000-000000000003';
  pa_floral_prop uuid := '0f100001-0000-4000-a000-000000000001';
  sm_casa_eng uuid := '0c87b79a-f6c9-447e-977c-06ecc892b164';
  pa_florist_eng uuid := 'd5f9ecc1-4ee0-4498-8d29-264bc34a8a9f';
  pa_sangeet uuid := 'd1a00001-0000-4000-a000-0000000000e3';
  dc uuid := 'dc000000-0000-4000-a000-00000000000d';
  tpl uuid := 'e11a0000-0000-4000-a000-000000000001';
  dc_contract uuid := 'c0117ac0-0000-4000-a000-0000000000dc';
  pa_flor_contract uuid := 'c0117ac0-0000-4000-a000-0000000000fa';
  sm_venue_contract uuid := 'c0117ac0-0000-4000-a000-0000000000ca';
begin
  if v_ws is null then return; end if;

  -- one studio template to draft from
  insert into public.contract_templates (id, workspace_id, kind, name, body)
    values (tpl, v_ws, 'full', 'Full planning — Atelier Mignon standard',
      'This full-planning agreement is between {couple_names} and Atelier Mignon.')
    on conflict (id) do nothing;

  -- ── Danielle & Cruz — the lead (phase hiring, no couple members yet) ────────
  if not exists (select 1 from public.weddings where slug = 'danielle-cruz') then
    insert into public.weddings (id, workspace_id, slug, couple_display, partner_a, partner_b, kind, phase, location_city, location_country, guest_target, budget_total)
      values (dc, v_ws, 'danielle-cruz', 'Danielle & Cruz', 'Danielle', 'Cruz', 'destination', 'hiring', 'Valle de Guadalupe', 'MX', 120, 220000);

    insert into public.contracts (id, wedding_id, template_id, kind, status, title)
      values (dc_contract, dc, tpl, 'planner_agreement', 'draft', 'Full planning agreement');
    insert into public.contract_draft_content (contract_id, body)
      values (dc_contract, 'This full-planning agreement is between {couple_names} and Atelier Mignon, for a destination wedding in Valle de Guadalupe, winter 2028. Fee schedule in four parts; the deposit opens the couple''s portal.');
    insert into public.contract_fields (contract_id, merge_source, field_key, label, signer_order, required, sort) values
      (dc_contract, 'couple_names', 'couple_names', 'Clients', null, false, 0),
      (dc_contract, 'workspace_profile', 'planner', 'Planner', null, false, 1),
      (dc_contract, 'manual', 'client_initials', 'Client initials', 1, true, 2);
    insert into public.contract_signers (contract_id, sign_order, role, name, email) values
      (dc_contract, 1, 'couple', 'Danielle Cruz', 'advisory+dc@statusbitcoin.com'),
      (dc_contract, 2, 'planner', 'Gio M.', null);
    insert into public.ledger_lines (wedding_id, title, amount, status, kind, category, contract_id, due_date)
      values (dc, 'Planner fee — deposit', 9500, 'due', 'planner_fee', 'planner', dc_contract, current_date + 14);
  end if;

  -- ── P&A — the money radar + a held florals contract ─────────────────────────
  if (select count(*) from public.ledger_lines where wedding_id = pa) = 0 then
    insert into public.ledger_lines (wedding_id, title, amount, status, kind, category, engagement_id, event_id, due_date) values
      (pa, 'Flor y Canto — estimate', 37000, 'expected', 'balance', 'florals', pa_florist_eng, pa_sangeet, null),
      (pa, 'Luz Films — milestone 2', 13000, 'due', 'progress', 'photo', null, null, current_date + 5),
      (pa, 'Cocina de Humo — progress', 26000, 'scheduled', 'progress', 'catering', null, null, current_date + 50),
      (pa, 'Your fee — milestone 3', 9500, 'scheduled', 'planner_fee', 'planner', null, null, current_date + 112);

    -- the florals contract, held on the change-requested proposal (draft-hold)
    insert into public.contracts (id, wedding_id, engagement_id, kind, status, title, blocking_proposal_id)
      values (pa_flor_contract, pa, pa_florist_eng, 'vendor', 'draft', 'Floral services agreement', pa_floral_prop)
      on conflict (id) do nothing;
    insert into public.contract_draft_content (contract_id, body)
      values (pa_flor_contract, 'Floral design & install for the Sangeet and Ceremony, per the approved concept "Bougainvillea & brass, blush revision".')
      on conflict (contract_id) do nothing;
    insert into public.contract_fields (contract_id, merge_source, field_key, label, signer_order, required, sort) values
      (pa_flor_contract, 'venue_restrictions', 'restrictions', 'Site conditions', null, false, 0),
      (pa_flor_contract, 'quote_amount', 'fee', 'Total fee', null, false, 1),
      (pa_flor_contract, 'manual', 'vendor_signature', 'Vendor signature', 1, true, 2);
    insert into public.contract_signers (contract_id, sign_order, role, name, email) values
      (pa_flor_contract, 1, 'vendor', 'Rosa Cantú — Flor y Canto', 'flor@atelier.demo');
    -- trace the florals estimate line to its contract
    update public.ledger_lines set contract_id = pa_flor_contract
      where wedding_id = pa and title = 'Flor y Canto — estimate' and contract_id is null;
  end if;

  -- ── S&M — a venue contract draft on the booked-to-be Casa Alma ──────────────
  if sm_casa_eng is not null and not exists (select 1 from public.contracts where wedding_id = sm and engagement_id = sm_casa_eng) then
    insert into public.contracts (id, wedding_id, engagement_id, kind, status, title)
      values (sm_venue_contract, sm, sm_casa_eng, 'venue', 'draft', 'Casa Alma — venue agreement')
      on conflict (id) do nothing;
    insert into public.contract_draft_content (contract_id, body)
      values (sm_venue_contract, 'Venue agreement for Casa Alma — private villa, courtyard for 120, San Miguel de Allende.')
      on conflict (contract_id) do nothing;
    insert into public.contract_fields (contract_id, merge_source, field_key, label, signer_order, required, sort) values
      (sm_venue_contract, 'couple_names', 'couple_names', 'Clients', null, false, 0),
      (sm_venue_contract, 'venue_restrictions', 'restrictions', 'Site conditions', null, false, 1),
      (sm_venue_contract, 'manual', 'vendor_signature', 'Vendor signature', 1, true, 2);
    insert into public.contract_signers (contract_id, sign_order, role, name, email) values
      (sm_venue_contract, 1, 'vendor', 'Casa Alma', 'casa@atelier.demo'),
      (sm_venue_contract, 2, 'couple', 'Sofía & Marco', null);
  end if;
end $$;
select
  (select count(*) from public.contracts) as contracts,
  (select count(*) from public.ledger_lines) as lines,
  (select count(*) from public.weddings where slug='danielle-cruz') as danielle;
