-- Demo tasks — M8 showcase. STAGING ONLY, service-role, idempotent. A handful of
-- tasks across P&A and E&L exercising all four columns and the three assignee
-- kinds, incl. one couple-assigned open task on P&A (so Darya's portal shows "Your
-- tasks") and one overdue vendor-assigned waiting task (feeding the chase list).
do $$
declare
  pa uuid := 'd1a00001-0000-4000-a000-000000000001';
  el uuid := 'd1a00002-0000-4000-a000-000000000002';
  planner uuid := 'feabba08-86fd-4e68-a71b-93d42c3bd405';
  vendor uuid := 'e1a00000-0000-4000-a000-000000000001';
  pa_sangeet uuid := 'd1a00001-0000-4000-a000-0000000000e3';
  pa_floral_prop uuid := '0f100001-0000-4000-a000-000000000001';
  pa_floral_contract uuid := 'c0117ac0-0000-4000-a000-0000000000fa';
begin
  if not exists (select 1 from public.tasks where id = '7a5c0001-0000-4000-a000-000000000001') then
    -- P&A: team pending, working, couple-waiting, vendor-waiting (overdue), completed, event-linked
    insert into public.tasks (id, wedding_id, title, assignee_kind, assignee_member, due_date) values
      ('7a5c0001-0000-4000-a000-000000000001', pa, 'Confirmar el conteo del mehndi', 'team', planner, current_date + 6);
    insert into public.tasks (id, wedding_id, title, status, due_date) values
      ('7a5c0001-0000-4000-a000-000000000002', pa, 'Diseñar el itinerario del Sangeet', 'working', current_date + 3);
    insert into public.tasks (id, wedding_id, title, assignee_kind, due_date) values
      ('7a5c0001-0000-4000-a000-000000000003', pa, 'Elegir la lista de música del brunch', 'couple', current_date + 4);
    insert into public.tasks (id, wedding_id, title, assignee_kind, assignee_vendor, due_date) values
      ('7a5c0001-0000-4000-a000-000000000004', pa, 'Enviar la revisión floral', 'vendor', vendor, current_date - 3);
    insert into public.tasks (id, wedding_id, title, status) values
      ('7a5c0001-0000-4000-a000-000000000005', pa, 'Reservar bloque de hotel', 'completed');
    insert into public.tasks (id, wedding_id, title, event_id, link_section, due_date) values
      ('7a5c0001-0000-4000-a000-000000000006', pa, 'Revisar el menú del Sangeet', pa_sangeet, 'menus', current_date + 8);
    -- §1E link exercises: one proposal-linked (flagged) + one contract-linked
    insert into public.tasks (id, wedding_id, title, proposal_id, flagged, due_date) values
      ('7a5c0001-0000-4000-a000-000000000007', pa, 'Perseguir la aprobación del concepto floral', pa_floral_prop, true, current_date + 1);
    insert into public.tasks (id, wedding_id, title, contract_id, due_date) values
      ('7a5c0001-0000-4000-a000-000000000008', pa, 'Revisar el borrador del contrato de florales', pa_floral_contract, current_date + 5);

    -- E&L: team pending + one completed + one couple-waiting
    insert into public.tasks (id, wedding_id, title, assignee_kind, assignee_member, due_date) values
      ('7a5c0002-0000-4000-a000-000000000001', el, 'Recorrido final en el Museo', 'team', planner, current_date + 10);
    insert into public.tasks (id, wedding_id, title, assignee_kind, due_date) values
      ('7a5c0002-0000-4000-a000-000000000002', el, 'Aprobar la paleta de papelería', 'couple', current_date + 5);
    insert into public.tasks (id, wedding_id, title, status) values
      ('7a5c0002-0000-4000-a000-000000000003', el, 'Enviar los salvar-la-fecha', 'completed');
  end if;
end $$;
