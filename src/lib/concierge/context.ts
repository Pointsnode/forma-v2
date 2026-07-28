import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countdownDays, gateItems, formatMoney, type WeddingRow, type EventRow } from "@/lib/wedding";
import { loadGoalMesh } from "@/lib/goals";

// ── Context assembly = isolation by construction (Decision D) ─────────────────
// A wedding scope's system block is assembled from THAT wedding's rows only. The
// model never receives another wedding's data, and RLS already scoped the reads
// to the planner. `weddingIds` is the exact set the block may mention — the route
// asserts the block references nothing outside it (the isolation DoD leg).
export type Scope = { kind: "wedding"; weddingId: string } | { kind: "orchestrator" };
export type AssembledContext = { system: string; weddingIds: string[]; workspaceId: string | null };

const GUIDE = `You are the Forma concierge, an assistant for a wedding planner working inside their studio software.
You answer from the CONTEXT below and the read tools, and you DRAFT work (proposals, tasks, contracts from templates, ledger lines) using the draft tools.
You NEVER send, sign, pay, advance a phase, or close a wedding — those are the planner's to click. If asked to send/sign/pay, politely decline, create the relevant draft instead, and point to the button in the app.
Be concise and concrete. Use the numbers in the context. Reply in the planner's language.`;

async function firstWorkspace(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("workspace_members").select("workspace_id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  return (data?.workspace_id as string) ?? null;
}

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

export async function assembleContext(supabase: SupabaseClient, scope: Scope): Promise<AssembledContext> {
  const workspaceId = await firstWorkspace(supabase);
  if (scope.kind === "wedding") {
    const block = await weddingBlock(supabase, scope.weddingId);
    if (!block) return { system: GUIDE + "\n\n(no wedding in scope)", weddingIds: [], workspaceId };
    const system = `${GUIDE}\n\nSCOPE: you are the agent for ONE wedding — ${block.name}. You know this wedding only; you have no access to any other wedding.\n\nCONTEXT:\n${block.text}`;
    return { system, weddingIds: [scope.weddingId], workspaceId };
  }

  // orchestrator: workspace-level rollups + one summary line per wedding
  const { data: weds } = await supabase
    .from("weddings")
    .select("id, couple_display, phase, date_start, guest_target, budget_total")
    .order("date_start", { ascending: true, nullsFirst: false });
  const weddings = (weds ?? []) as { id: string; couple_display: string; phase: string; date_start: string | null; guest_target: number | null; budget_total: number | null }[];
  const { data: radar } = await supabase.from("money_radar").select("couple_display, title, amount, due_date, status").order("due_date", { ascending: true });
  const radarRows = (radar ?? []) as { couple_display: string; title: string; amount: number; due_date: string; status: string }[];

  const lines = weddings.map((w) => {
    const days = countdownDays(w.date_start);
    return `- ${w.couple_display} (id ${w.id}) · phase ${w.phase}${days != null ? ` · ${days >= 0 ? `${days}d to day one` : `${-days}d ago`}` : ""} · budget ${formatMoney(w.budget_total ?? 0, "en") ?? "—"}`;
  });
  const dues = radarRows.slice(0, 12).map((r) => `- ${r.couple_display}: ${r.title} ${formatMoney(r.amount, "en") ?? ""} due ${r.due_date} (${r.status})`);
  const system = `${GUIDE}\n\nSCOPE: you are the studio orchestrator — you see workspace-level rollups across all weddings, and per-wedding summaries. For deep work inside one wedding, the planner opens that wedding.\n\nWEDDINGS (${weddings.length}):\n${lines.join("\n") || "none"}\n\nUPCOMING DUES (next 60 days):\n${dues.join("\n") || "none"}`;
  return { system, weddingIds: weddings.map((w) => w.id), workspaceId };
}
