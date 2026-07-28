import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessage, DraftRef } from "./agent";
import type { Scope } from "./context";

export type Budget = { enabled: boolean; used: number; cap: number; over: boolean };

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

// Load (or create) the thread for this scope and return its message history mapped
// to the model's alternating user/assistant shape.
export async function loadThread(
  supabase: SupabaseClient,
  opts: { threadId: string | null; scope: Scope; workspaceId: string; userId: string; firstMessage: string },
): Promise<{ threadId: string; history: ChatMessage[] }> {
  const threadId = opts.threadId;
  if (!threadId) {
    const { data, error } = await supabase.from("concierge_threads").insert({
      workspace_id: opts.workspaceId,
      wedding_id: opts.scope.kind === "wedding" ? opts.scope.weddingId : null,
      title: opts.firstMessage.slice(0, 80),
      created_by: opts.userId,
    }).select("id").single();
    if (error || !data) throw new Error(`thread create: ${error?.message}`);
    return { threadId: data.id as string, history: [] };
  }
  const { data: rows } = await supabase.from("concierge_messages").select("role, content").eq("thread_id", threadId).order("created_at", { ascending: true });
  const history = ((rows ?? []) as { role: string; content: string }[]).map((m) => ({
    role: (m.role === "concierge" ? "assistant" : "user") as ChatMessage["role"],
    content: m.content,
  }));
  return { threadId, history };
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
export type StoredMessage = { id: string; role: "planner" | "concierge"; content: string; draft_ref: unknown; action_ref: unknown };

export async function listThreads(supabase: SupabaseClient, scope: Scope, workspaceId: string): Promise<ThreadSummary[]> {
  let q = supabase.from("concierge_threads").select("id, title, updated_at").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(25);
  q = scope.kind === "wedding" ? q.eq("wedding_id", scope.weddingId) : q.is("wedding_id", null);
  const { data } = await q;
  return (data ?? []) as ThreadSummary[];
}

export async function loadThreadMessages(supabase: SupabaseClient, threadId: string): Promise<StoredMessage[]> {
  const { data } = await supabase.from("concierge_messages").select("id, role, content, draft_ref, action_ref").eq("thread_id", threadId).order("created_at", { ascending: true });
  return (data ?? []) as StoredMessage[];
}

// Isolation guard (Decision D, verified server-side): in a wedding scope, the
// assembled system block must NOT mention any other wedding's couple name. By
// construction it can't (we only queried the scoped wedding) — this is the belt
// that proves it, and refuses rather than leak if it ever regressed.
export async function assertIsolation(supabase: SupabaseClient, system: string, scope: Scope): Promise<void> {
  if (scope.kind !== "wedding") return;
  const { data } = await supabase.from("weddings").select("id, couple_display");
  const others = ((data ?? []) as { id: string; couple_display: string }[]).filter((w) => w.id !== scope.weddingId);
  for (const w of others) {
    if (w.couple_display && system.includes(w.couple_display)) {
      throw new Error(`isolation breach: wedding scope leaked "${w.couple_display}"`);
    }
  }
}
