import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessage, DraftRef } from "./agent";
import type { Scope } from "./context";
import { conciergeError } from "./errors";
import { otherCoupleIn } from "./resolve.mjs";
import { foldHistory } from "./history.mjs";

export type Budget = { enabled: boolean; used: number; cap: number; over: boolean };

// ── §A The front door: authorize a wedding before ANY orchestrator-scope read ────
// The concierge runs server-side under the planner's RLS session; the model produces the
// wedding_id, so it must never be trusted. workspaceId is server-derived (currentWorkspace —
// always a workspace the caller is a MEMBER of), so "the wedding is in workspaceId" == the
// caller is staff of it (is_wedding_staff = member of the wedding's workspace). A hallucinated
// or carried-over id, or one from another workspace, fails to match → FC010, never data.
// (FC011 for a missing id is raised at the tool boundary, before this is called.)
export async function assertWeddingReachable(supabase: SupabaseClient, weddingId: string, workspaceId: string): Promise<void> {
  if (!weddingId) conciergeError("FC011");
  const { data } = await supabase.from("weddings").select("workspace_id").eq("id", weddingId).maybeSingle();
  if (!data || (data.workspace_id as string) !== workspaceId) conciergeError("FC010");
}

// Pending approval-card count across the workspace's threads — RLS already scopes
// concierge_messages to the planner's workspace, so the count is theirs. Seeds the
// bubble's count-dot on cold load, before any client state exists (DoD-2 signal
// must survive reload); live state supersedes it once the panel is used.
export async function loadPendingCount(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from("concierge_messages")
    .select("id", { count: "exact", head: true })
    .filter("action_ref->>status", "eq", "pending");
  return count ?? 0;
}

// Month-to-date usage vs the workspace cap (Decision F — the honest meter).
export async function loadBudget(supabase: SupabaseClient, workspaceId: string): Promise<Budget> {
  const now = new Date();
  const firstOfMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const [{ data: settings }, { data: usage }] = await Promise.all([
    supabase.from("concierge_settings").select("enabled, monthly_token_cap").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("concierge_usage").select("tokens_in, tokens_out").eq("workspace_id", workspaceId).gte("day", firstOfMonth),
  ]);
  const used = ((usage ?? []) as { tokens_in: number; tokens_out: number }[]).reduce((n, u) => n + Number(u.tokens_in) + Number(u.tokens_out), 0);
  const cap = Number(settings?.monthly_token_cap ?? 0);
  return { enabled: !!settings?.enabled, used, cap, over: cap > 0 && used >= cap };
}

// Fold a thread's rows into the model's alternating transcript — the draft/action refs
// become bracketed [created draft …] notes so the model recalls its own tool work.
export async function threadHistory(supabase: SupabaseClient, threadId: string): Promise<ChatMessage[]> {
  const { data: rows } = await supabase.from("concierge_messages").select("role, content, draft_ref, action_ref").eq("thread_id", threadId).order("created_at", { ascending: true });
  return foldHistory(rows ?? []) as ChatMessage[];
}

// The wedding_id a thread belongs to (null = a studio/orchestrator thread). Used to detect a
// wedding-focused continuation: an orchestrator turn whose client threadId is a wedding thread
// is really a turn about that wedding (§E), and runs isolated to it.
export async function threadWeddingId(supabase: SupabaseClient, threadId: string): Promise<string | null> {
  const { data } = await supabase.from("concierge_threads").select("wedding_id").eq("id", threadId).maybeSingle();
  return (data?.wedding_id as string | null) ?? null;
}

// §E "one thread per wedding is the memory": the wedding's canonical thread is its OLDEST
// (deterministic) thread; both rooms — the wedding room and a studio turn that resolves to this
// wedding — read from and append to it, so a budget discussion started at the studio is present
// when the planner opens the wedding, and vice versa. Find-or-create.
export async function canonicalWeddingThread(supabase: SupabaseClient, workspaceId: string, weddingId: string, userId: string, firstMessage: string): Promise<string> {
  const { data: existing } = await supabase.from("concierge_threads")
    .select("id").eq("workspace_id", workspaceId).eq("wedding_id", weddingId)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await supabase.from("concierge_threads")
    .insert({ workspace_id: workspaceId, wedding_id: weddingId, title: firstMessage.slice(0, 80), created_by: userId })
    .select("id").single();
  if (error || !data) throw new Error(`thread create: ${error?.message}`);
  return data.id as string;
}

// A fresh studio (orchestrator, wedding_id null) thread — holds only cross-wedding / studio-
// general turns (§E). Created lazily once a turn is known NOT to resolve to a single wedding.
export async function createStudioThread(supabase: SupabaseClient, workspaceId: string, userId: string, firstMessage: string): Promise<string> {
  const { data, error } = await supabase.from("concierge_threads")
    .insert({ workspace_id: workspaceId, wedding_id: null, title: firstMessage.slice(0, 80), created_by: userId })
    .select("id").single();
  if (error || !data) throw new Error(`thread create: ${error?.message}`);
  return data.id as string;
}

export async function saveMessage(
  supabase: SupabaseClient, threadId: string, role: "planner" | "concierge", content: string,
  refs?: { draft?: DraftRef | null; action?: Record<string, unknown> | null },
): Promise<string | null> {
  const { data } = await supabase.from("concierge_messages")
    .insert({ thread_id: threadId, role, content, draft_ref: refs?.draft ?? null, action_ref: refs?.action ?? null })
    .select("id").maybeSingle();
  await supabase.from("concierge_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
  return (data?.id as string) ?? null;
}

// Finding 2: the panel lists a scope's threads (RLS-scoped) and opens the most
// recent with its full message history — so seeded/persisted conversations are
// reachable and a reload never orphans history.
export type ThreadSummary = { id: string; title: string; updated_at: string };
export type StoredMessage = { id: string; role: "planner" | "concierge"; content: string; draft_ref: unknown; action_ref: unknown; created_at: string };

export async function listThreads(supabase: SupabaseClient, scope: Scope, workspaceId: string): Promise<ThreadSummary[]> {
  let q = supabase.from("concierge_threads").select("id, title, updated_at").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(25);
  q = scope.kind === "wedding" ? q.eq("wedding_id", scope.weddingId) : q.is("wedding_id", null);
  const { data } = await q;
  return (data ?? []) as ThreadSummary[];
}

export async function loadThreadMessages(supabase: SupabaseClient, threadId: string): Promise<StoredMessage[]> {
  const { data } = await supabase.from("concierge_messages").select("id, role, content, draft_ref, action_ref, created_at").eq("thread_id", threadId).order("created_at", { ascending: true });
  return (data ?? []) as StoredMessage[];
}

// The couple_display (within this workspace) of any wedding OTHER than `keepId` that appears
// in `text`, or null if none. Workspace-scoped: isolation is within one studio.
export async function scanOtherCouples(supabase: SupabaseClient, workspaceId: string, keepId: string, text: string): Promise<string | null> {
  const { data } = await supabase.from("weddings").select("id, couple_display").eq("workspace_id", workspaceId);
  return otherCoupleIn((data ?? []) as { id: string; couple_display: string }[], keepId, text);
}

// §F Isolation, keyed off the DESTINATION thread — NOT the entry scope. For any turn being
// persisted to wedding W's thread (whether asked from the wedding room OR from the studio), the
// assembled context + tool outputs must contain no OTHER couple's name — a wedding thread can
// never accumulate another couple's data, law 3. A turn destined for the studio thread
// (destinationWeddingId null) may name many couples (its purpose) and is never scanned.
export async function assertIsolation(supabase: SupabaseClient, workspaceId: string, destinationWeddingId: string | null, text: string): Promise<void> {
  if (!destinationWeddingId) return;
  const leaked = await scanOtherCouples(supabase, workspaceId, destinationWeddingId, text);
  if (leaked) throw new Error(`isolation breach: wedding thread leaked "${leaked}"`);
}
