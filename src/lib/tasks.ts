import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { initials } from "@/lib/wedding";
import { taskHref } from "@/lib/task-href.mjs";
import { compareTasks } from "@/lib/task-sort.mjs";

export { taskHref };

// The four columns, in board order. "waiting" is the manual twin of the chase list.
export const TASK_COLUMNS = ["pending", "working", "waiting", "completed"] as const;
export type TaskStatus = (typeof TASK_COLUMNS)[number];
export type AssigneeKind = "team" | "couple" | "vendor";

export type TaskCard = {
  id: string;
  title: string;
  note: string | null;
  status: TaskStatus;
  flagged: boolean;
  due_date: string | null;
  wedding_id: string | null;
  weddingName: string | null;      // master board chip
  weddingInitials: string | null;
  eventId: string | null;
  eventLabel: string | null;
  linkSection: string | null;
  assigneeKind: AssigneeKind | null;
  assigneeMember: string | null;   // display name
  assigneeVendor: string | null;   // vendor name
  assigneeLabel: string | null;    // resolved chip label
  // subject link (at most one)
  proposalId: string | null;
  contractId: string | null;
  engagementId: string | null;
  documentId: string | null;
  href: string;                    // where the card body lands (§1E)
};

type Row = {
  id: string; title: string; note: string | null; status: TaskStatus; flagged: boolean; due_date: string | null;
  wedding_id: string | null; workspace_id: string | null; event_id: string | null; link_section: string | null;
  assignee_kind: AssigneeKind | null; assignee_member: string | null; assignee_vendor: string | null;
  proposal_id: string | null; contract_id: string | null; engagement_id: string | null; document_id: string | null;
};

const COLS =
  "id, title, note, status, flagged, due_date, wedding_id, workspace_id, event_id, link_section, assignee_kind, assignee_member, assignee_vendor, proposal_id, contract_id, engagement_id, document_id";

async function hydrate(supabase: SupabaseClient, rows: Row[]): Promise<TaskCard[]> {
  const memberIds = [...new Set(rows.map((r) => r.assignee_member).filter((x): x is string => !!x))];
  const vendorIds = [...new Set(rows.map((r) => r.assignee_vendor).filter((x): x is string => !!x))];
  const eventIds = [...new Set(rows.map((r) => r.event_id).filter((x): x is string => !!x))];
  const weddingIds = [...new Set(rows.map((r) => r.wedding_id).filter((x): x is string => !!x))];

  const [members, vendors, events, weddings] = await Promise.all([
    memberIds.length ? supabase.from("profiles").select("id, display_name").in("id", memberIds) : Promise.resolve({ data: [] }),
    vendorIds.length ? supabase.from("vendors").select("id, name").in("id", vendorIds) : Promise.resolve({ data: [] }),
    eventIds.length ? supabase.from("wedding_events").select("id, label").in("id", eventIds) : Promise.resolve({ data: [] }),
    weddingIds.length ? supabase.from("weddings").select("id, couple_display").in("id", weddingIds) : Promise.resolve({ data: [] }),
  ]);
  const memberName = new Map(((members.data ?? []) as { id: string; display_name: string | null }[]).map((m) => [m.id, m.display_name]));
  const vendorName = new Map(((vendors.data ?? []) as { id: string; name: string }[]).map((v) => [v.id, v.name]));
  const eventLabel = new Map(((events.data ?? []) as { id: string; label: string }[]).map((e) => [e.id, e.label]));
  const weddingName = new Map(((weddings.data ?? []) as { id: string; couple_display: string }[]).map((w) => [w.id, w.couple_display]));

  return rows.map((r) => {
    const wName = r.wedding_id ? weddingName.get(r.wedding_id) ?? null : null;
    const assigneeMember = r.assignee_member ? memberName.get(r.assignee_member) ?? "—" : null;
    const assigneeVendor = r.assignee_vendor ? vendorName.get(r.assignee_vendor) ?? "—" : null;
    const assigneeLabel = r.assignee_kind === "couple" ? (wName ?? "Couple") : r.assignee_kind === "team" ? assigneeMember : r.assignee_kind === "vendor" ? assigneeVendor : null;
    return {
      id: r.id, title: r.title, note: r.note, status: r.status, flagged: r.flagged, due_date: r.due_date,
      wedding_id: r.wedding_id, weddingName: wName, weddingInitials: wName ? initials(wName) : null,
      eventId: r.event_id, eventLabel: r.event_id ? eventLabel.get(r.event_id) ?? null : null, linkSection: r.link_section,
      assigneeKind: r.assignee_kind, assigneeMember, assigneeVendor, assigneeLabel,
      proposalId: r.proposal_id, contractId: r.contract_id, engagementId: r.engagement_id, documentId: r.document_id,
      href: taskHref({ wedding_id: r.wedding_id, eventId: r.event_id, linkSection: r.link_section, proposalId: r.proposal_id, contractId: r.contract_id, engagementId: r.engagement_id, documentId: r.document_id }),
    };
  });
}

export type Board = Record<TaskStatus, TaskCard[]>;
function group(cards: TaskCard[], today: string): Board {
  const board: Board = { pending: [], working: [], waiting: [], completed: [] };
  for (const c of cards) board[c.status].push(c);
  for (const col of TASK_COLUMNS) board[col].sort((a, b) => compareTasks(a, b, today));
  return board;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export async function loadWeddingBoard(supabase: SupabaseClient, weddingId: string): Promise<Board> {
  const { data } = await supabase.from("tasks").select(COLS).eq("wedding_id", weddingId).order("created_at", { ascending: false });
  return group(await hydrate(supabase, (data ?? []) as Row[]), todayISO());
}

// Master board: every wedding's manual tasks + studio-level tasks (RLS scopes to
// the planner's workspace).
export async function loadMasterBoard(supabase: SupabaseClient): Promise<Board> {
  const { data } = await supabase.from("tasks").select(COLS).order("created_at", { ascending: false });
  return group(await hydrate(supabase, (data ?? []) as Row[]), todayISO());
}

// Couple portal: their open assigned tasks (RLS already limits them to couple-assigned).
export async function loadCoupleTasks(supabase: SupabaseClient, weddingId: string): Promise<TaskCard[]> {
  const { data } = await supabase.from("tasks").select(COLS).eq("wedding_id", weddingId).order("due_date", { ascending: true, nullsFirst: false });
  return hydrate(supabase, (data ?? []) as Row[]);
}
