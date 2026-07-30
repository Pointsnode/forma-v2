import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countdownDays, gateItems, formatMoney, type WeddingRow, type EventRow } from "@/lib/wedding";
import { currentWorkspace as firstWorkspace } from "@/lib/workspace";
import { loadGoalMesh } from "@/lib/goals";

// ── Context assembly = isolation by construction (Decision D) ─────────────────
// A wedding scope's system block is assembled from THAT wedding's rows only. The
// model never receives another wedding's data, and RLS already scoped the reads
// to the planner. `weddingIds` is the exact set the block may mention — the route
// asserts the block references nothing outside it (the isolation DoD leg).
export type Scope = { kind: "wedding"; weddingId: string } | { kind: "orchestrator" };
export type AssembledContext = { system: string; weddingIds: string[]; workspaceId: string | null };

const GUIDE = `You are the Forma concierge, an assistant for a wedding planner working inside their studio software.
You answer from the CONTEXT below and the read tools. You have two kinds of hands:
- DRAFT tools (create draft proposal / task / contract-from-template / expected ledger line) — these make safe drafts directly. A task can be assigned (assignee='couple', or a team member / vendor by name) and attached to an event by label; couple/vendor tasks start in "waiting". Creating tasks is your job; completing them is NOT.
- propose_action — for anything that would LEAVE the studio (send, sign, pay, book, request/accept/decline a quote, lock a menu, advance a phase, schedule a touchpoint). You NEVER execute these; you propose them and the planner approves with a tap. If asked to "just send it", do NOT refuse and do NOT send — call propose_action so an approval card appears, and say so.
You cannot close a wedding at all. Be concise and concrete; use the numbers in the context.
Resolve any relative date ("this Friday", "in two weeks", "next month") against Today (given below) into an absolute YYYY-MM-DD before calling a tool — never guess a year.
Earlier turns record what you created as bracketed notes like [created draft proposal id=… "…"] or [proposed action …] — reuse those ids directly (e.g. to send a proposal you drafted), or call list_proposals/list_contracts/list_tasks to look one up. Never ask the planner for an id. Those bracketed notes are INTERNAL memory — never write them or ids in your reply; the draft/action card already shows the planner the details.
Never claim a draft or approval card exists unless a tool result in THIS turn confirms it — if you didn't call the tool, say what you'll do and call it.
Seating is id-strict: assign_seat needs REAL event_id/guest_id/table_id UUIDs from the seating tool, never invented ones. If propose_action is refused (an id didn't resolve), call the seating tool to fetch the real ids and retry ONCE — never tell the planner a seating card is ready unless propose_action returned ok.`;

// M16a orchestrator (studio) addendum — appended only at orchestrator scope. The studio has no
// wedding in front of it: naming one means resolve_wedding → a real id → the read/draft tools.
const ORCH_GUIDE = `
At the STUDIO you have no wedding open. To answer about a specific wedding, ALWAYS call resolve_wedding first to turn what the planner said (a couple, a venue, a city, "the Ibiza one") into a real wedding_id, then call the read/draft tools with that wedding_id. If resolve_wedding returns more than one, ask the planner which one — name each by couple, date and venue; if none, ask them to clarify. NEVER guess a wedding or a wedding_id, and never pick one when it's ambiguous.
When the question is about ONE wedding, use resolve_wedding and THAT wedding's read/draft tools ONLY — do NOT also call weddings_overview. weddings_overview lists other couples, and pulling it into a single-wedding turn keeps that turn out of the wedding's memory. Reserve weddings_overview for genuinely cross-wedding questions ("which weddings need attention?").
You can READ any wedding, make safe DRAFTS, and PROPOSE execute-actions here (send, void, message the couple, complete a task, convert an inquiry, and the rest) — but you NEVER run any of them yourself: propose_action draws an approval card and only the planner's tap executes it, under their session. For a wedding-taking action pass wedding_id (from resolve_wedding); never claim you did or sent anything — say you've prepared it for their approval.`;


async function weddingBlock(supabase: SupabaseClient, id: string): Promise<{ text: string; name: string } | null> {
  const { data: w } = await supabase
    .from("weddings")
    .select("id, workspace_id, couple_display, phase, kind, location_city, location_country, date_start, date_end, guest_target, budget_total")
    .eq("id", id).maybeSingle();
  if (!w) return null;
  const wedding = w as WeddingRow;
  const { data: evs } = await supabase.from("wedding_events").select("id, label, kind, event_date, start_time, end_time, order_index, guest_target").eq("wedding_id", id).order("event_date", { ascending: true, nullsFirst: false });
  const events = (evs ?? []) as EventRow[];

  const [{ data: roll }, { data: guests }, mesh] = await Promise.all([
    supabase.from("wedding_money_rollup").select("budget_total, paid, committed, open").eq("wedding_id", id).maybeSingle(),
    supabase.from("guest_rsvp_rollup").select("invited, answered, yes, no, maybe, pending").eq("wedding_id", id).maybeSingle(),
    loadGoalMesh(supabase, wedding, events),
  ]);
  const money = (roll ?? {}) as { budget_total?: number; paid?: number; committed?: number; open?: number };
  const g = (guests ?? { invited: 0, answered: 0, yes: 0, no: 0, maybe: 0, pending: 0 }) as { invited: number; answered: number; yes: number; no: number; maybe: number; pending: number };
  const days = countdownDays(wedding.date_start);
  const gate = gateItems(wedding, events).filter((i) => !i.done).map((i) => i.key);
  const datedEvents = events.filter((e) => e.event_date).length;
  const roomSchedule = events.filter((e) => (mesh.scheduleByEvent.get(e.id) ?? 0) > 0).length;

  const lines = [
    `WEDDING: ${wedding.couple_display} (id ${wedding.id})`,
    `Phase: ${wedding.phase}${days != null ? ` · day one ${days >= 0 ? `in ${days} days` : `${-days} days ago`}` : " · undated"}`,
    `Location: ${[wedding.location_city, wedding.location_country].filter(Boolean).join(", ") || "—"} · kind ${wedding.kind ?? "—"}`,
    `Events (${events.length}, ${datedEvents} dated): ${events.map((e) => `${e.label}${e.event_date ? ` ${e.event_date}` : ""}`).join("; ") || "none"}`,
    `Budget ${formatMoney(money.budget_total ?? wedding.budget_total ?? 0, "en") ?? "—"} · paid ${formatMoney(money.paid ?? 0, "en") ?? "$0"} · committed ${formatMoney(money.committed ?? 0, "en") ?? "$0"} · open ${formatMoney(money.open ?? 0, "en") ?? "—"}`,
    `Guests: target ${wedding.guest_target ?? "—"} · invited ${g.invited} · answered ${g.answered} · yes ${g.yes} · pending RSVP ${g.pending}`,
    `Vendors: ${mesh.bookedCount} booked of ${mesh.engCount} in play${mesh.bookedKinds.size ? ` (${[...mesh.bookedKinds].join(", ")})` : ""}`,
    `Contracts: ${mesh.contractsSigned} signed of ${mesh.contractsTotal}`,
    `Run-of-show: ${roomSchedule} of ${events.length} events have a schedule`,
    gate.length ? `Open 2→3 gate items: ${gate.join(", ")}` : "Phase gate: clear or date-driven",
  ];
  return { text: lines.join("\n"), name: wedding.couple_display };
}

export async function assembleContext(supabase: SupabaseClient, scope: Scope, locale = "en"): Promise<AssembledContext> {
  const workspaceId = await firstWorkspace(supabase);
  const today = new Date().toISOString().slice(0, 10);
  const langLine = `\n\nToday is ${today}. The planner's language is "${locale}". Reply in it.`;
  if (scope.kind === "wedding") {
    const block = await weddingBlock(supabase, scope.weddingId);
    if (!block) return { system: GUIDE + langLine + "\n\n(no wedding in scope)", weddingIds: [], workspaceId };
    const system = `${GUIDE}${langLine}\n\nSCOPE: you are the agent for ONE wedding — ${block.name}. You know this wedding only; you have no access to any other wedding.\n\nCONTEXT:\n${block.text}`;
    return { system, weddingIds: [scope.weddingId], workspaceId };
  }

  // §G orchestrator: studio name + counts ONLY. The per-wedding list (couple/id/budget) is a
  // tool now (weddings_overview), so the prompt no longer bakes every couple — it stops growing
  // with the business (it stopped fitting ~40 weddings), and removing the couple names is what
  // lets a studio turn be routed into ONE wedding's thread and isolation-checked (§E/§F). No
  // couple_display or wedding id appears in the orchestrator prompt anymore.
  const [{ count: weddingCount }, ws] = await Promise.all([
    supabase.from("weddings").select("id", { count: "exact", head: true }),
    workspaceId ? supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const studio = ((ws?.data as { name?: string } | null)?.name) ?? "your studio";
  const system = `${GUIDE}${ORCH_GUIDE}${langLine}\n\nSCOPE: you are the studio orchestrator for ${studio} — ${weddingCount ?? 0} wedding(s) under management. No single wedding is open in front of you; reach one with resolve_wedding, then the read/draft tools.`;
  return { system, weddingIds: [], workspaceId };
}
