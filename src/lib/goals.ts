import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHASE_ORDER, type Phase, type EventRow, type WeddingRow } from "@/lib/wedding";

// What's-next is COMPUTED (§1E): a goal library, each goal detect()s over the mesh;
// overrides exist only for what detection can't see, and detection auto-wins upward
// (a detected-done goal is done regardless of a dismiss). No milestones, no checkbox
// theater — a goal a detector can see is never also a manual task.

export type GoalPhase = "foundations" | "details" | "wedding_days";
export type SubChip = { label: string; done: boolean };
export type Goal = {
  key: string; phase: GoalPhase; title: string;
  done: boolean; detail: string | null; subs: SubChip[];
  link?: { href: string; label: string }; overridable: boolean; override: "manual_done" | "dismissed" | null; overrideNote: string | null;
};
export type GoalPhaseGroup = { phase: GoalPhase; title: string; locked: boolean; done: number; total: number; goals: Goal[] };

type Mesh = {
  wedding: WeddingRow; events: EventRow[];
  bookedKinds: Set<string>; engCount: number; bookedCount: number;
  guests: { invited: number; answered: number; yes: number };
  invitesSent: boolean;
  menusByEvent: Map<string, { hasOptions: boolean; locked: boolean }>;
  scheduleByEvent: Map<string, number>;
  contractsSigned: number; contractsTotal: number;
  overrides: Map<string, { status: "manual_done" | "dismissed"; note: string | null }>;
};

export async function loadGoalMesh(supabase: SupabaseClient, wedding: WeddingRow, events: EventRow[]): Promise<Mesh> {
  const id = wedding.id;
  const [{ data: engs }, { data: rollup }, { data: tps }, { data: menus }, { data: sched }, { data: contracts }, { data: ovr }] = await Promise.all([
    supabase.from("wedding_vendors").select("status, vendors(kind)").eq("wedding_id", id),
    supabase.from("guest_rsvp_rollup").select("invited, answered, yes").eq("wedding_id", id).maybeSingle(),
    supabase.from("touchpoints").select("kind").eq("wedding_id", id).eq("kind", "rsvp_invite"),
    supabase.from("menus").select("id, event_id, locked_at, menu_options(id)").eq("wedding_id", id),
    supabase.from("schedule_items").select("event_id").eq("wedding_id", id),
    supabase.from("contracts").select("status").eq("wedding_id", id),
    supabase.from("wedding_goal_overrides").select("goal_key, status, note").eq("wedding_id", id),
  ]);
  const engRows = (engs ?? []) as unknown as { status: string; vendors: { kind: string } | null }[];
  const bookedKinds = new Set(engRows.filter((e) => e.status === "booked").map((e) => e.vendors?.kind ?? ""));
  const menusByEvent = new Map<string, { hasOptions: boolean; locked: boolean }>();
  for (const m of (menus ?? []) as unknown as { event_id: string; locked_at: string | null; menu_options: { id: string }[] }[]) {
    menusByEvent.set(m.event_id, { hasOptions: (m.menu_options ?? []).length > 0, locked: !!m.locked_at });
  }
  const scheduleByEvent = new Map<string, number>();
  for (const s of (sched ?? []) as { event_id: string }[]) scheduleByEvent.set(s.event_id, (scheduleByEvent.get(s.event_id) ?? 0) + 1);
  const cs = (contracts ?? []) as { status: string }[];
  return {
    wedding, events,
    bookedKinds, engCount: engRows.length, bookedCount: engRows.filter((e) => e.status === "booked").length,
    guests: { invited: rollup?.invited ?? 0, answered: rollup?.answered ?? 0, yes: rollup?.yes ?? 0 },
    invitesSent: (tps ?? []).length > 0,
    menusByEvent, scheduleByEvent,
    contractsSigned: cs.filter((c) => c.status === "completed").length, contractsTotal: cs.length,
    overrides: new Map((ovr ?? []).map((o: { goal_key: string; status: "manual_done" | "dismissed"; note: string | null }) => [o.goal_key, { status: o.status, note: o.note }])),
  };
}

const GKEYS = { date: "set_date", venue: "lock_venue", budget: "set_budget", team: "book_team", guestsIn: "guest_list_in", invites: "invitations_out", rsvps: "rsvps_in", menus: "menus_defined", seating: "seating_started", ros: "run_of_show", contracts: "contracts_signed" } as const;

type GoalT = (k: string, v?: Record<string, string | number>) => string;

export function computeGoals(m: Mesh, id: string, t: GoalT): GoalPhaseGroup[] {
  const dated = m.events.filter((e) => e.event_date).length;
  const g = (key: string, phase: GoalPhase, title: string, done: boolean, detail: string | null, subs: SubChip[] = [], link?: Goal["link"], overridable = false): Goal => {
    const o = m.overrides.get(key) ?? null;
    return { key, phase, title, done: done || o?.status === "manual_done", detail, subs, link, overridable, override: o?.status ?? null, overrideNote: o?.note ?? null };
  };
  const evLink = (label: string) => ({ href: `/wedding/${id}/guests`, label }) as Goal["link"];

  const goals: Goal[] = [
    g(GKEYS.date, "foundations", t("setDate"), dated > 0 && dated === m.events.length, m.events.length ? t("datedOf", { done: dated, total: m.events.length }) : null, m.events.map((e) => ({ label: e.label, done: !!e.event_date }))),
    g(GKEYS.venue, "foundations", t("lockVenue"), m.bookedKinds.has("venue"), m.bookedKinds.has("venue") ? t("venueBooked") : t("venueNone"), [], { href: `/wedding/${id}/vendors`, label: t("linkVendors") }),
    g(GKEYS.budget, "foundations", t("setBudget"), Number(m.wedding.budget_total ?? 0) > 0, Number(m.wedding.budget_total ?? 0) > 0 ? t("budgetDetected") : t("budgetNone"), [], { href: `/wedding/${id}/budget`, label: t("linkBudget") }),
    g(GKEYS.team, "details", t("team"), m.bookedCount >= 4, t("teamBooked", { done: m.bookedCount, total: m.engCount || "—" }), [...m.bookedKinds].map((k) => ({ label: k, done: true })), { href: `/wedding/${id}/vendors`, label: t("linkVendors") }),
    g(GKEYS.guestsIn, "details", t("guestsIn"), m.guests.invited > 0, m.guests.invited > 0 ? t("guestsUploaded", { count: m.guests.invited }) : t("guestsNone"), [], evLink(t("linkGuests"))),
    g(GKEYS.invites, "details", t("invites"), m.invitesSent, m.invitesSent ? t("invitesSent") : t("invitesNone"), [], evLink(t("linkGuests"))),
    g(GKEYS.rsvps, "details", t("rsvps"), m.guests.invited > 0 && m.guests.answered >= m.guests.invited, m.guests.invited ? t("countOf", { done: m.guests.answered, total: m.guests.invited }) : null, [], evLink(t("linkGuests"))),
    g(GKEYS.menus, "details", t("menus"), m.events.length > 0 && m.events.every((e) => m.menusByEvent.get(e.id)?.hasOptions), null, m.events.map((e) => ({ label: e.label, done: !!m.menusByEvent.get(e.id)?.hasOptions }))),
    g(GKEYS.ros, "details", t("ros"), m.events.length > 0 && m.events.every((e) => (m.scheduleByEvent.get(e.id) ?? 0) > 0), null, m.events.map((e) => ({ label: e.label, done: (m.scheduleByEvent.get(e.id) ?? 0) > 0 }))),
    g(GKEYS.contracts, "details", t("contracts"), m.contractsTotal > 0 && m.contractsSigned === m.contractsTotal, m.contractsTotal ? t("countOf", { done: m.contractsSigned, total: m.contractsTotal }) : null, [], { href: `/wedding/${id}/contracts`, label: t("linkContracts") }),
    g(GKEYS.seating, "details", t("seating"), false, t("seatingHint"), [], undefined, true),
  ];

  const phases: { phase: GoalPhase; title: string }[] = [
    { phase: "foundations", title: t("phaseFoundations") }, { phase: "details", title: t("phaseDetails") }, { phase: "wedding_days", title: t("phaseWeddingDays") },
  ];
  const curIdx = PHASE_ORDER.indexOf(m.wedding.phase === "closed" ? "wedding_days" : (m.wedding.phase as Phase));
  return phases.map((p) => {
    const gs = goals.filter((x) => x.phase === p.phase && x.override !== "dismissed");
    const locked = PHASE_ORDER.indexOf(p.phase as Phase) > Math.max(curIdx, PHASE_ORDER.indexOf("details"));
    return { phase: p.phase, title: p.title, locked, done: gs.filter((x) => x.done).length, total: gs.length, goals: gs };
  });
}
