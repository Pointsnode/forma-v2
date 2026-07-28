-- Demo concierge — M7 showcase. STAGING ONLY, service-role, idempotent. Enables
-- the concierge for Atelier Mignon and seeds two threads: one orchestrator thread
-- ("¿Qué sigue esta semana?") and one P&A thread whose exchange ends in a real
-- DRAFT task card (stamped actor_kind='concierge') — so the gate and the demo open
-- onto something real. Depends on demo_weddings.sql (P&A) + the studio workspace.
do $$
declare
  v_ws uuid := '6dd03946-8121-4894-bbc5-34a8257a5548';
  planner uuid := 'feabba08-86fd-4e68-a71b-93d42c3bd405';
  pa uuid := 'd1a00001-0000-4000-a000-000000000001';
  orch_thread uuid := 'c0c1e100-0000-4000-a000-000000000001';
  pa_thread uuid := 'c0c1e100-0000-4000-a000-000000000002';
  pa_task uuid := '7a5c0000-0000-4000-a000-000000000001';
begin
  if v_ws is null then return; end if;

  insert into public.concierge_settings (workspace_id, enabled)
    values (v_ws, true)
    on conflict (workspace_id) do update set enabled = true;

  -- ── orchestrator thread (NULL wedding) ──────────────────────────────────────
  insert into public.concierge_threads (id, workspace_id, wedding_id, title, created_by)
    values (orch_thread, v_ws, null, '¿Qué sigue esta semana?', planner)
    on conflict (id) do nothing;
  if not exists (select 1 from public.concierge_messages where thread_id = orch_thread) then
    insert into public.concierge_messages (thread_id, role, content) values
      (orch_thread, 'planner', '¿Qué sigue esta semana en el estudio?'),
      (orch_thread, 'concierge', 'Tres cosas: la firma de Danielle & Cruz sigue pendiente, P&A tiene el contrato de florales retenido por la aprobación del concepto, y hay dos pagos por vencer en los próximos 15 días. ¿Preparo algo?');
  end if;

  -- ── P&A thread ending in a draft task card ─────────────────────────────────
  insert into public.concierge_threads (id, workspace_id, wedding_id, title, created_by)
    values (pa_thread, v_ws, pa, 'Priya & Arjun — seguimiento', planner)
    on conflict (id) do nothing;
  if not exists (select 1 from public.concierge_messages where thread_id = pa_thread) then
    -- the real draft task the card points to, stamped as the concierge
    if not exists (select 1 from public.tasks where id = pa_task) then
      perform set_config('forma.acting_as_concierge', 'on', true);
      insert into public.tasks (id, wedding_id, title, due_date)
        values (pa_task, pa, 'Perseguir la revisión floral (desbloquea el contrato)', current_date + 2);
      perform private.log_activity(pa, planner, 'task_drafted', 'Perseguir la revisión floral (desbloquea el contrato)', jsonb_build_object('task_id', pa_task));
      perform set_config('forma.acting_as_concierge', 'off', true);
    end if;
    insert into public.concierge_messages (thread_id, role, content, draft_ref) values
      (pa_thread, 'planner', '¿Qué falta para cerrar el contrato de florales de P&A?', null),
      (pa_thread, 'concierge', 'El contrato sigue retenido hasta que la pareja apruebe el concepto "Bougainvillea & brass". Lo que falta es enviar la revisión floral. Te dejé una tarea para perseguirla — tú decides cuándo enviarla.',
        jsonb_build_object('kind','task','id',pa_task,'title','Perseguir la revisión floral (desbloquea el contrato)'));
  end if;

  -- a pending APPROVAL card (the second lane): the concierge proposes sending the
  -- florals contract; Approve would hit the draft-hold and surface the function's
  -- own refusal on the card — the exceptions-first count-dot lights for this.
  if not exists (select 1 from public.concierge_messages where thread_id = pa_thread and action_ref is not null) then
    insert into public.concierge_messages (thread_id, role, content, action_ref) values
      (pa_thread, 'concierge', 'Cuando la pareja apruebe el concepto, esto queda listo para enviar a firma. ¿Lo apruebas?',
        jsonb_build_object('fn','send_contract','args', jsonb_build_object('contract_id','c0117ac0-0000-4000-a000-0000000000fa'),
          'summary','Enviar el contrato de florales de P&A para firma','status','pending'));
  end if;
end $$;
