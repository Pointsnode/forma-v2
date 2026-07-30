import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolDef, DraftRef, ActionRef } from "./agent";
import type { Scope } from "./context";
import { validateAction } from "./approval-lane.mjs";
import { matchWeddings } from "./resolve.mjs";
import { assertWeddingReachable } from "./session";
import { conciergeError } from "./errors";
import { clearanceGate } from "@/lib/workspace";
import { formatMoney } from "@/lib/wedding";
import { seatLabel } from "@/lib/seat-geometry.mjs";

// The registry IS the draft-first guarantee (Decision C): reads + draft-writes
// only. No send/sign/pay/advance/close tool exists — so even a jailbroken prompt
// has no hands for them, and the 0009 DB guards stand behind that. Wedding-scope
// writes auto-target the scoped wedding (the model can't name another).
//
// M16a: the orchestrator (studio) scope gains the SAME read/draft tools, but each names its
// wedding via a REQUIRED wedding_id, authorized by assertWeddingReachable (§A) before any read
// — a missing id is FC011 (never a silent pick), an unreachable id is FC010. `touched` records
// which weddings a turn actually read/drafted, so the route can route the turn to that wedding's
// thread (§E) and prove isolation (§F). propose_action is NOT lifted here — execution is M16b.

// `touched` = weddings actually read/drafted (via targetWedding); `resolved` = the wedding a
// resolve_wedding call pinned to exactly one match. The route routes a studio turn to a wedding's
// thread when the UNION of the two is a single wedding — so a turn concerning one wedding lands
// there regardless of which read tool the model happened to use (not just when it hit a read).
export type ToolCtx = { supabase: SupabaseClient; scope: Scope; workspaceId: string | null; touched?: Set<string>; resolved?: Set<string> };

const s = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, required });

export function conciergeTools(scope: Scope): ToolDef[] {
  if (scope.kind === "wedding") {
    return [
      { name: "guests_pending", description: "List guests who have not yet answered their RSVP.", input_schema: s({}) },
      { name: "ledger", description: "List this wedding's money ledger lines (title, amount, status, due date).", input_schema: s({}) },
      { name: "list_proposals", description: "List this wedding's proposals with their id, title and status — use this to find the id of a proposal to send.", input_schema: s({}) },
      { name: "list_contracts", description: "List this wedding's contracts with their id, title and status — use this to find the id of a contract to send.", input_schema: s({}) },
      { name: "list_tasks", description: "List this wedding's tasks with their id, title and done state.", input_schema: s({}) },
      { name: "seating", description: "The seating for this wedding's events — each table with its capacity and who sits in which chair. Use to answer 'who sits at table 5'.", input_schema: s({}) },
      { name: "list_vendors", description: "The studio's vendor catalogue — id, name and kind. Call this to find a vendor's real id before proposing present_vendor.", input_schema: s({}) },
      { name: "events", description: "This wedding's events — id, label and date, plus which venue (if any) is already engaged for each. Call this before proposing a venue: a venue must name at least one event, and you pass their ids as event_ids.", input_schema: s({}) },
      { name: "draft_proposal", description: "Create a DRAFT proposal for the couple (never sent). Returns a draft the planner sends from the proposal room.", input_schema: s({ title: { type: "string" }, note: { type: "string" }, estimate_amount: { type: "number" } }, ["title"]) },
      { name: "add_task", description: "Add a task for this wedding. Optionally assign it — assignee='couple' to give it to the couple, or assignee_member (a team member's name), or assignee_vendor (a vendor's name) — attach it to an event by label, and set flagged=true to mark it urgent. Couple/vendor tasks start in 'waiting'. Resolve any relative due date against Today.", input_schema: s({ title: { type: "string" }, due_date: { type: "string", description: "YYYY-MM-DD, resolved against Today" }, assignee: { type: "string", description: "'couple' to assign the couple; omit otherwise" }, assignee_member: { type: "string" }, assignee_vendor: { type: "string" }, event: { type: "string" }, flagged: { type: "boolean" } }, ["title"]) },
      { name: "draft_contract", description: "Create a DRAFT contract from a studio template (never sent). template is the template name; kind is planner_agreement|vendor|venue.", input_schema: s({ title: { type: "string" }, template: { type: "string" }, kind: { type: "string" } }, ["title"]) },
      { name: "add_ledger_line", description: "Add a manual EXPECTED ledger line (an anticipated cost). Never marks anything paid.", input_schema: s({ title: { type: "string" }, amount: { type: "number" }, due_date: { type: "string" } }, ["title", "amount"]) },
      { name: "propose_action", description: "Propose a leave-the-studio action for the planner to APPROVE — you NEVER execute it. Use this whenever asked to present a vendor/venue, send a quote to the couple, send, sign, pay, book, request/accept/decline a quote, lock a menu, advance a phase, or schedule a touchpoint. fn ∈ [send_proposal, send_contract, present_vendor (args vendor_id from list_vendors + wedding_id — both real UUIDs, never a name — plus event_ids, an array of event UUIDs from the events tool; a venue on a multi-event wedding MUST name at least one event), send_quote (args quote_id — a real UUID, only once the quote has an amount), request_quote, record_quote, accept_quote, decline_quote, book_engagement, lock_menu, advance_phase, schedule_touchpoint, mark_line_paid, assign_seat (args event_id, guest_id, table_id — all real UUIDs from the seating tool — and seat_no, the 0-based chair number A=0 B=1 C=2… as an integer; call the seating tool first to get the ids)]. args carries the ids (e.g. {proposal_id} or {contract_id}); summary is a one-line human description of what will happen.", input_schema: s({ fn: { type: "string" }, args: { type: "object" }, summary: { type: "string" } }, ["fn", "summary"]) },
    ];
  }
  // Orchestrator (studio) scope — M16a. The read/draft tools, each naming its wedding with a
  // REQUIRED wedding_id (authorized before any read). resolve_wedding turns free text into a
  // wedding id so nobody types a UUID; weddings_overview lists on demand (replacing the baked
  // block). No propose_action — execution is M16b. list_vendors is the studio catalogue, so it
  // takes no wedding_id.
  const w = { type: "string", description: "The wedding's id — get it from resolve_wedding; never guess one." };
  return [
    { name: "resolve_wedding", description: "Turn free text (a couple's name, a venue, a city, a date, 'the Ibiza one') into the matching wedding(s) — id, couple, date, phase, venue. ALWAYS call this first to get a wedding_id; if it returns more than one, ask the planner which one (name each); if none, ask them to clarify. Never guess a wedding or its id.", input_schema: s({ query: { type: "string" } }, ["query"]) },
    { name: "weddings_overview", description: "List the studio's weddings on demand — id, couple, phase, date, budget. filter ∈ active|upcoming|needs_attention|all.", input_schema: s({ filter: { type: "string" } }) },
    { name: "guests_pending", description: "List a wedding's guests who have not yet answered their RSVP.", input_schema: s({ wedding_id: w }, ["wedding_id"]) },
    { name: "ledger", description: "List a wedding's money ledger lines (title, amount, status, due date).", input_schema: s({ wedding_id: w }, ["wedding_id"]) },
    { name: "list_proposals", description: "List a wedding's proposals with their id, title and status.", input_schema: s({ wedding_id: w }, ["wedding_id"]) },
    { name: "list_contracts", description: "List a wedding's contracts with their id, title and status.", input_schema: s({ wedding_id: w }, ["wedding_id"]) },
    { name: "list_tasks", description: "List a wedding's tasks with their id, title and done state.", input_schema: s({ wedding_id: w }, ["wedding_id"]) },
    { name: "seating", description: "A wedding's seating — each table with its capacity and who sits in which chair.", input_schema: s({ wedding_id: w }, ["wedding_id"]) },
    { name: "list_vendors", description: "The studio's vendor catalogue — id, name and kind (workspace-wide, not tied to one wedding).", input_schema: s({}) },
    { name: "events", description: "A wedding's events — id, label and date, plus which venue (if any) is engaged for each.", input_schema: s({ wedding_id: w }, ["wedding_id"]) },
    { name: "draft_proposal", description: "Create a DRAFT proposal for a wedding's couple (never sent). Returns a draft the planner sends from the proposal room.", input_schema: s({ wedding_id: w, title: { type: "string" }, note: { type: "string" }, estimate_amount: { type: "number" } }, ["wedding_id", "title"]) },
    { name: "add_task", description: "Add a task for a wedding. Optionally assign it (assignee='couple', or assignee_member / assignee_vendor by name), attach to an event by label, flagged=true for urgent. Resolve any relative due date against Today.", input_schema: s({ wedding_id: w, title: { type: "string" }, due_date: { type: "string", description: "YYYY-MM-DD, resolved against Today" }, assignee: { type: "string" }, assignee_member: { type: "string" }, assignee_vendor: { type: "string" }, event: { type: "string" }, flagged: { type: "boolean" } }, ["wedding_id", "title"]) },
    { name: "draft_contract", description: "Create a DRAFT contract for a wedding from a studio template (never sent). template is the template name; kind is planner_agreement|vendor|venue.", input_schema: s({ wedding_id: w, title: { type: "string" }, template: { type: "string" }, kind: { type: "string" } }, ["wedding_id", "title"]) },
    { name: "add_ledger_line", description: "Add a manual EXPECTED ledger line to a wedding (an anticipated cost). Never marks anything paid.", input_schema: s({ wedding_id: w, title: { type: "string" }, amount: { type: "number" }, due_date: { type: "string" } }, ["wedding_id", "title", "amount"]) },
    { name: "add_studio_task", description: "Add a studio-level task (not tied to one wedding).", input_schema: s({ title: { type: "string" }, due_date: { type: "string" } }, ["title"]) },
  ];
}

async function rpcId(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as string;
}

export async function execTool(ctx: ToolCtx, name: string, input: Record<string, unknown>): Promise<{ content: string; draft?: DraftRef; action?: ActionRef }> {
  const { supabase, scope, workspaceId } = ctx;
  const wid = scope.kind === "wedding" ? scope.weddingId : null;

  // §A/§B The wedding a call targets. Wedding scope = the scoped wedding (unchanged — no arg, no
  // auth needed, it IS the scope). Orchestrator scope = the REQUIRED wedding_id arg, authorized
  // before any read: a missing id → FC011 (never a silent pick of the most recent wedding), an
  // unreachable id → FC010. Records the wedding so the route can thread + isolate the turn (§E/§F).
  async function targetWedding(): Promise<string> {
    if (scope.kind === "wedding") return scope.weddingId;
    const id = typeof input.wedding_id === "string" ? input.wedding_id.trim() : "";
    if (!id) conciergeError("FC011");
    await assertWeddingReachable(supabase, id, workspaceId ?? "");
    ctx.touched?.add(id);
    return id;
  }

  switch (name) {
    case "propose_action": {
      const fn = String(input.fn ?? "");
      const args = (input.args && typeof input.args === "object" ? input.args : {}) as Record<string, unknown>;
      // a wedding-scoped action defaults its wedding to the scoped one (isolation)
      if (wid && args.wedding_id == null) args.wedding_id = wid;
      const v = validateAction(fn, args) as { ok: boolean; error?: string };
      if (!v.ok) return { content: `That action can't be proposed: ${v.error}. Only these are approvable: send_proposal, send_contract, request_quote, record_quote, accept_quote, decline_quote, book_engagement, lock_menu, advance_phase, schedule_touchpoint, mark_line_paid.` };
      const summary = String(input.summary ?? fn);
      return { content: `Prepared for your approval — it stays unexecuted until you tap Approve: ${summary}`, action: { fn, args, summary, status: "pending" } };
    }
    case "guests_pending": {
      const target = await targetWedding();
      const [{ data: exc }, { data: roll }] = await Promise.all([
        supabase.from("guest_exceptions").select("full_name, reason").eq("wedding_id", target),
        supabase.from("guest_rsvp_rollup").select("invited, answered, pending").eq("wedding_id", target).maybeSingle(),
      ]);
      const names = ((exc ?? []) as { full_name: string; reason: string }[]).filter((r) => r.reason === "unanswered").map((r) => r.full_name);
      const r = (roll ?? { invited: 0, answered: 0, pending: 0 }) as { invited: number; answered: number; pending: number };
      const head = `${r.pending} of ${r.invited} still to answer (${r.answered} in).`;
      return { content: names.length ? `${head} Reminded but silent: ${names.join(", ")}` : head };
    }
    case "ledger": {
      // "How's the budget" wants the picture, not the headline: the paid/committed/open rollup the
      // wedding room already shows, plus the lines — amounts formatted (so the model states the
      // studio's real currency, $, instead of guessing a symbol from a bare number).
      const target = await targetWedding();
      const [{ data }, { data: roll }] = await Promise.all([
        supabase.from("ledger_lines").select("title, amount, status, due_date").eq("wedding_id", target).order("due_date", { ascending: true, nullsFirst: false }),
        supabase.from("wedding_money_rollup").select("budget_total, paid, committed, open").eq("wedding_id", target).maybeSingle(),
      ]);
      const rows = (data ?? []) as { title: string; amount: number; status: string; due_date: string | null }[];
      const m = (roll ?? {}) as { budget_total?: number; paid?: number; committed?: number; open?: number };
      const money = (n: number | null | undefined) => formatMoney(n ?? 0, "en") ?? "$0";
      const summary = `Budget ${money(m.budget_total)} · paid ${money(m.paid)} · committed ${money(m.committed)} · open ${money(m.open)}`;
      const lines = rows.length ? rows.map((r) => `${r.title}: ${money(r.amount)} (${r.status}${r.due_date ? `, due ${r.due_date}` : ""})`).join("\n") : "No ledger lines yet.";
      return { content: `${summary}\n${lines}` };
    }
    case "list_proposals": {
      const target = await targetWedding();
      const { data } = await supabase.from("proposals").select("id, title, status").eq("wedding_id", target).order("created_at", { ascending: false });
      const rows = (data ?? []) as { id: string; title: string; status: string }[];
      return { content: rows.length ? rows.map((r) => `${r.id} · ${r.title} · ${r.status}`).join("\n") : "No proposals yet." };
    }
    case "list_contracts": {
      const target = await targetWedding();
      const { data } = await supabase.from("contracts").select("id, title, status").eq("wedding_id", target).order("created_at", { ascending: false });
      const rows = (data ?? []) as { id: string; title: string; status: string }[];
      return { content: rows.length ? rows.map((r) => `${r.id} · ${r.title} · ${r.status}`).join("\n") : "No contracts yet." };
    }
    case "list_tasks": {
      const target = await targetWedding();
      const { data } = await supabase.from("tasks").select("id, title, done_at").eq("wedding_id", target).order("created_at", { ascending: false });
      const rows = (data ?? []) as { id: string; title: string; done_at: string | null }[];
      return { content: rows.length ? rows.map((r) => `${r.id} · ${r.title} · ${r.done_at ? "done" : "open"}`).join("\n") : "No tasks yet." };
    }
    case "seating": {
      // Return the ids the model needs to propose a seat: event_id per plan,
      // table_id + capacity per table, chair number + guest_id per occupant, and
      // the unseated attending guests (with ids). No ids → it can't seat anyone.
      const target = await targetWedding();
      const { data: planRows } = await supabase.from("floor_plans").select("id, event_id").eq("wedding_id", target);
      const plans = (planRows ?? []) as { id: string; event_id: string }[];
      if (!plans.length) return { content: "No floor plans yet." };
      const eventIds = [...new Set(plans.map((p) => p.event_id))];
      const [{ data: evs }, { data: tbls }, { data: egs }] = await Promise.all([
        supabase.from("wedding_events").select("id, label").in("id", eventIds),
        supabase.from("seating_tables").select("id, name, capacity, floor_plan_id").in("floor_plan_id", plans.map((p) => p.id)).order("sort"),
        supabase.from("event_guests").select("event_id, guest_id, rsvp_status, guests(full_name)").in("event_id", eventIds),
      ]);
      const eventLabel = new Map(((evs ?? []) as { id: string; label: string }[]).map((e) => [e.id, e.label]));
      const tables = (tbls ?? []) as { id: string; name: string; capacity: number; floor_plan_id: string }[];
      const egsAll = (egs ?? []) as unknown as { event_id: string; guest_id: string; rsvp_status: string; guests: { full_name: string } | null }[];
      const nameBy = new Map(egsAll.map((e) => [e.guest_id, e.guests?.full_name ?? "—"]));
      const { data: seatRows } = tables.length ? await supabase.from("seats").select("table_id, seat_no, guest_id").in("table_id", tables.map((t) => t.id)) : { data: [] };
      const seats = (seatRows ?? []) as { table_id: string; seat_no: number; guest_id: string }[];
      const out = plans.map((p) => {
        const evTables = tables.filter((t) => t.floor_plan_id === p.id);
        const seatedIds = new Set(seats.filter((s) => evTables.some((t) => t.id === s.table_id)).map((s) => s.guest_id));
        const lines = [`Event ${eventLabel.get(p.event_id) ?? "—"} (event_id=${p.event_id}):`];
        for (const tb of evTables) {
          const occ = seats.filter((s) => s.table_id === tb.id).sort((a, b) => a.seat_no - b.seat_no).map((s) => `${seatLabel(s.seat_no)}[seat_no=${s.seat_no}]=${nameBy.get(s.guest_id) ?? "—"}[guest_id=${s.guest_id}]`);
          lines.push(`  ${tb.name} (table_id=${tb.id}, cap ${tb.capacity}): ${occ.join(", ") || "empty"}`);
        }
        const unseated = egsAll.filter((e) => e.event_id === p.event_id && e.rsvp_status === "yes" && !seatedIds.has(e.guest_id)).map((e) => `${e.guests?.full_name ?? "—"}[guest_id=${e.guest_id}]`);
        lines.push(`  Unseated attending: ${unseated.join(", ") || "none"}`);
        return lines.join("\n");
      });
      return { content: out.join("\n\n") };
    }
    case "list_vendors": {
      const { data } = await supabase.from("vendors").select("id, name, kind").order("name", { ascending: true });
      const rows = (data ?? []) as { id: string; name: string; kind: string }[];
      return { content: rows.length ? rows.map((r) => `${r.id} · ${r.name} · ${r.kind}`).join("\n") : "No vendors in the catalogue yet." };
    }
    case "events": {
      const target = await targetWedding();
      const { data: evs } = await supabase.from("wedding_events").select("id, label, event_date").eq("wedding_id", target).order("event_date", { ascending: true, nullsFirst: false });
      const events = (evs ?? []) as { id: string; label: string; event_date: string | null }[];
      const { data: booked } = await supabase.from("event_vendors").select("event_id, engagement_id").eq("wedding_id", target).eq("venue_booked", true);
      const bookedRows = (booked ?? []) as { event_id: string; engagement_id: string }[];
      const engIds = [...new Set(bookedRows.map((b) => b.engagement_id))];
      const venueBy = new Map<string, string>();
      if (engIds.length) {
        const { data: wv } = await supabase.from("wedding_vendors").select("id, vendors(name)").in("id", engIds);
        const nameByEng = new Map(((wv ?? []) as unknown as { id: string; vendors: { name: string } | null }[]).map((r) => [r.id, r.vendors?.name ?? "—"]));
        for (const b of bookedRows) venueBy.set(b.event_id, nameByEng.get(b.engagement_id) ?? "—");
      }
      return {
        content: events.length
          ? events.map((e) => `${e.label} (event_id=${e.id}${e.event_date ? `, ${e.event_date}` : ""})${venueBy.has(e.id) ? ` — venue: ${venueBy.get(e.id)}` : ""}`).join("\n")
          : "No events yet.",
      };
    }
    case "draft_proposal": {
      const target = await targetWedding();
      // §H a proposal follows the M15 'send' lane (send_proposal → 'send'); a coordinator without
      // it may read but not draft one. clearanceGate is checked in the caller's current workspace,
      // which assertWeddingReachable guarantees is this wedding's workspace.
      if (await clearanceGate(supabase, "send")) conciergeError("FS050");
      const id = await rpcId(supabase, "concierge_draft_proposal", { p_wedding: target, p_title: input.title, p_note: input.note ?? null, p_estimate: input.estimate_amount ?? null, p_event_ref: null });
      return { content: `Draft proposal created (id ${id}). The planner sends it from the proposal room.`, draft: { kind: "proposal", id, title: String(input.title) } };
    }
    case "add_task": {
      const target = await targetWedding();
      if (await clearanceGate(supabase, "tasks")) conciergeError("FS050"); // §H tasks lane — the concierge must not be a hole in the box model
      let kind: string | null = null, member: string | null = null, vendor: string | null = null;
      if (String(input.assignee ?? "").toLowerCase() === "couple") kind = "couple";
      else if (input.assignee_member && workspaceId) {
        const { data } = await supabase.from("workspace_members").select("user_id, profiles(display_name)").eq("workspace_id", workspaceId);
        const hit = ((data ?? []) as unknown as { user_id: string; profiles: { display_name: string | null } | null }[]).find((m) => (m.profiles?.display_name ?? "").toLowerCase().includes(String(input.assignee_member).toLowerCase()));
        if (hit) { kind = "team"; member = hit.user_id; }
      } else if (input.assignee_vendor && workspaceId) {
        const { data } = await supabase.from("vendors").select("id").eq("workspace_id", workspaceId).ilike("name", `%${String(input.assignee_vendor)}%`).limit(1).maybeSingle();
        if (data) { kind = "vendor"; vendor = data.id as string; }
      }
      let eventId: string | null = null;
      if (input.event) {
        const { data } = await supabase.from("wedding_events").select("id").eq("wedding_id", target).ilike("label", `%${String(input.event)}%`).limit(1).maybeSingle();
        eventId = (data?.id as string) ?? null;
      }
      const id = await rpcId(supabase, "concierge_add_task", { p_wedding: target, p_workspace: null, p_title: input.title, p_due: input.due_date ?? null, p_assignee_kind: kind, p_assignee_member: member, p_assignee_vendor: vendor, p_event: eventId, p_flagged: input.flagged === true });
      return { content: `Task added (id ${id})${kind ? `, assigned to ${kind}` : ""}.`, draft: { kind: "task", id, title: String(input.title) } };
    }
    case "add_studio_task": {
      if (await clearanceGate(supabase, "tasks")) conciergeError("FS050"); // §H tasks lane (same box as add_task)
      const id = await rpcId(supabase, "concierge_add_task", { p_wedding: null, p_workspace: workspaceId, p_title: input.title, p_due: input.due_date ?? null, p_assignee_kind: null, p_assignee_member: null, p_assignee_vendor: null, p_event: null, p_flagged: input.flagged === true });
      return { content: `Studio task added (id ${id}).`, draft: { kind: "task", id, title: String(input.title) } };
    }
    case "draft_contract": {
      const target = await targetWedding();
      if (await clearanceGate(supabase, "contracts")) conciergeError("FS050"); // §H contracts lane
      let templateId: string | null = null;
      if (input.template && workspaceId) {
        const { data: t } = await supabase.from("contract_templates").select("id").eq("workspace_id", workspaceId).ilike("name", `%${String(input.template)}%`).limit(1).maybeSingle();
        templateId = (t?.id as string) ?? null;
      }
      const id = await rpcId(supabase, "concierge_draft_contract", { p_wedding: target, p_template: templateId, p_title: input.title, p_kind: input.kind ?? "vendor" });
      return { content: `Draft contract created (id ${id}). The planner reviews and sends it from the contract room.`, draft: { kind: "contract", id, title: String(input.title) } };
    }
    case "add_ledger_line": {
      const target = await targetWedding();
      if (await clearanceGate(supabase, "ledger")) conciergeError("FS050"); // §H ledger lane
      const id = await rpcId(supabase, "concierge_add_ledger_line", { p_wedding: target, p_title: input.title, p_amount: input.amount, p_due: input.due_date ?? null });
      return { content: `Expected ledger line added (id ${id}).`, draft: { kind: "ledger", id, title: String(input.title) } };
    }
    case "resolve_wedding": {
      // §C free text → the matching wedding(s), WORKSPACE-FILTERED BY CONSTRUCTION: the .eq on
      // workspace_id is the authorization — it cannot return a wedding it would then have to
      // authorize. 0 and multiple matches are both first-class; the GUIDE tells the model to ask
      // (naming each), never to pick. No touched.add here: discovery isn't a wedding read — the
      // subsequent read tool authorizes and records the wedding.
      const raw = String(input.query ?? "").trim();
      const { data } = await supabase
        .from("weddings")
        .select("id, couple_display, phase, date_start, location_city, location_country")
        .eq("workspace_id", workspaceId ?? "")
        .order("date_start", { ascending: true, nullsFirst: false });
      type W = { id: string; couple_display: string; phase: string; date_start: string | null; location_city: string | null; location_country: string | null };
      const matches = matchWeddings((data ?? []) as W[], raw) as W[];
      const fmt = (w: W) => `${w.id} · ${w.couple_display}${w.date_start ? ` · ${w.date_start}` : ""} · ${w.phase}${w.location_city ? ` · ${[w.location_city, w.location_country].filter(Boolean).join(", ")}` : ""}`;
      if (matches.length === 0) return { content: `No wedding matches "${raw}". Ask the planner which wedding they mean — don't guess.` };
      if (matches.length === 1) {
        // An unambiguous resolution IS the turn's subject — record it so the route files the turn
        // into this wedding's thread even if the model answers from resolve/overview without a read.
        ctx.resolved?.add(matches[0].id);
        return { content: `One match — use this wedding_id: ${fmt(matches[0])}` };
      }
      return { content: `Several match — ask the planner which one, naming each (couple · date · venue):\n${matches.map(fmt).join("\n")}` };
    }
    case "weddings_overview": {
      // §G the compact per-wedding list on demand, replacing the baked prompt block. Workspace-
      // filtered. Studio-general (names many couples) — a turn that calls this stays in the studio
      // thread by §F (its output carries other couples, so it never reroutes to one wedding).
      // Deliberately does NOT carry budget_total: a budget question must go through the wedding's
      // ledger (its real paid/committed/open), not this headline — which also kept "how's X's
      // budget" from routing to X's thread (the model answered here in one call, touching nothing).
      const filter = String(input.filter ?? "all");
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("weddings")
        .select("id, couple_display, phase, date_start")
        .eq("workspace_id", workspaceId ?? "")
        .order("date_start", { ascending: true, nullsFirst: false });
      type WO = { id: string; couple_display: string; phase: string; date_start: string | null };
      let rows = (data ?? []) as WO[];
      if (filter === "active") rows = rows.filter((w) => w.phase !== "closed");
      else if (filter === "upcoming") rows = rows.filter((w) => w.phase !== "closed" && w.date_start != null && w.date_start >= today);
      else if (filter === "needs_attention") {
        const { data: radar } = await supabase.from("money_radar").select("couple_display");
        const flagged = new Set(((radar ?? []) as { couple_display: string }[]).map((r) => r.couple_display));
        rows = rows.filter((w) => flagged.has(w.couple_display));
      }
      return {
        content: rows.length
          ? rows.map((w) => `${w.id} · ${w.couple_display} · ${w.phase}${w.date_start ? ` · ${w.date_start}` : ""}`).join("\n")
          : "No weddings match that filter.",
      };
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}
