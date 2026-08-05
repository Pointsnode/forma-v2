import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace as firstWorkspace, clearanceGate } from "@/lib/workspace";
import { conciergeConfigured } from "@/lib/concierge/config";
import { assembleContext, type Scope } from "@/lib/concierge/context";
import { conciergeTools, execTool } from "@/lib/concierge/tools";
import { runConciergeTurn, type ChatMessage } from "@/lib/concierge/agent";
import {
  loadBudget, saveMessage, assertIsolation, scanOtherCouples, listThreads, loadThreadMessages,
  threadHistory, threadWeddingId, canonicalWeddingThread, createStudioThread,
} from "@/lib/concierge/session";
import { subjectWedding } from "@/lib/concierge/resolve.mjs";

// Planner-facing text shouldn't show raw markup or the internal id-note format —
// strip emphasis/headings/code ticks and any [created draft …]/[proposed action …]
// notes the model may echo from its transcript memory.
function plain(t: string): string {
  return t
    .replace(/\[(?:created draft|proposed action)[^\]]*\]/gi, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Node runtime (server session + no edge). The concierge acts through the signed-in
// planner's RLS session — no service-role here, so this route is NOT on the
// service-role allowlist.
export const dynamic = "force-dynamic";

type Body = { threadId?: string | null; scope?: { weddingId?: string | null } | null; message?: string; locale?: string };

const line = (o: unknown) => new TextEncoder().encode(JSON.stringify(o) + "\n");

// GET — the panel's history: the scope's threads + the requested (or most recent)
// thread's messages. RLS scopes to the planner's workspace.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const weddingId = url.searchParams.get("weddingId");
  const wantThread = url.searchParams.get("threadId");
  const scope: Scope = weddingId ? { kind: "wedding", weddingId } : { kind: "orchestrator" };
  const workspaceId = await firstWorkspace(supabase);
  if (!workspaceId) return NextResponse.json({ threads: [], threadId: null, messages: [] });

  const threads = await listThreads(supabase, scope, workspaceId);
  const threadId = wantThread ?? threads[0]?.id ?? null;
  const messages = threadId ? await loadThreadMessages(supabase, threadId) : [];
  return NextResponse.json({ threads, threadId, messages });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "empty" }, { status: 400 });
  const scope: Scope = body.scope?.weddingId ? { kind: "wedding", weddingId: body.scope.weddingId } : { kind: "orchestrator" };
  const locale = body.locale === "es" ? "es" : "en";

  const workspaceId = await firstWorkspace(supabase);
  if (!workspaceId) return NextResponse.json({ error: "no_workspace" }, { status: 403 });
  // The concierge box gates USE (it's the priced seat) — a member without it is refused,
  // pointing at /team where an admin ticks it. route.ts:86's "raise the cap" now has a home.
  if (await clearanceGate(supabase, "concierge")) return NextResponse.json({ error: "no_clearance" }, { status: 403 });

  const budget = await loadBudget(supabase, workspaceId);
  if (!budget.enabled) return NextResponse.json({ error: "not_entitled" }, { status: 403 });

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (o: unknown) => controller.enqueue(line(o));
      try {
        // ── §E route the turn to its memory. A wedding-room turn stays in that wedding's canonical
        // thread. A studio turn continues its client thread's focus (a wedding thread → that
        // wedding; a studio thread → studio). A FRESH studio turn is DEFERRED: it runs as the
        // orchestrator and its destination is decided after the turn — if it resolved to exactly
        // one wedding (and named no other couple, §F), it lands in that wedding's thread.
        const clientThreadId = body.threadId ?? null;
        let effectiveScope: Scope;
        let destThreadId: string | null; // null → deferred (decide after the turn)
        let destWeddingId: string | null; // the wedding this turn is isolated to (null → studio)
        let history: ChatMessage[] = [];

        if (scope.kind === "wedding") {
          effectiveScope = scope;
          destWeddingId = scope.weddingId;
          destThreadId = clientThreadId ?? await canonicalWeddingThread(supabase, workspaceId, scope.weddingId, user.id, message);
          history = await threadHistory(supabase, destThreadId);
        } else if (clientThreadId) {
          const focus = await threadWeddingId(supabase, clientThreadId);
          effectiveScope = focus ? { kind: "wedding", weddingId: focus } : { kind: "orchestrator" };
          destWeddingId = focus;
          destThreadId = clientThreadId;
          history = await threadHistory(supabase, clientThreadId);
        } else {
          effectiveScope = { kind: "orchestrator" };
          destWeddingId = null;
          destThreadId = null; // deferred until we know which wedding (if any) this turn is about
        }

        // The planner message is saved as soon as the destination is known; a deferred studio
        // turn saves it after the turn resolves (avoids orphan/empty threads). A refusal forces a
        // studio thread so the message still lands somewhere.
        let plannerSaved = false;
        if (destThreadId) {
          emit({ type: "thread", threadId: destThreadId });
          await saveMessage(supabase, destThreadId, "planner", message);
          plannerSaved = true;
        }
        const savePlannerTo = async (tid: string) => { if (!plannerSaved) { emit({ type: "thread", threadId: tid }); await saveMessage(supabase, tid, "planner", message); plannerSaved = true; } };

        // budget refusal — honest, no model call (Decision F)
        if (budget.over) {
          const tid = destThreadId ?? await createStudioThread(supabase, workspaceId, user.id, message);
          await savePlannerTo(tid);
          const refusal = "I've used this month's included thinking. Raise the cap in the concierge settings and I'll pick right back up.";
          await saveMessage(supabase, tid, "concierge", refusal);
          emit({ type: "token", text: refusal });
          emit({ type: "done", used: budget.used, cap: budget.cap, over: true });
          controller.close();
          return;
        }

        // keyless — degrade honestly (the key is the studio's to paste)
        if (!conciergeConfigured()) {
          const tid = destThreadId ?? await createStudioThread(supabase, workspaceId, user.id, message);
          await savePlannerTo(tid);
          const notice = "The concierge isn't configured yet, the studio needs to add its model key. Your message is saved.";
          await saveMessage(supabase, tid, "concierge", notice);
          emit({ type: "token", text: notice });
          emit({ type: "done", used: budget.used, cap: budget.cap, notConfigured: true });
          controller.close();
          return;
        }

        const { system } = await assembleContext(supabase, effectiveScope, locale);
        // §F isolation on the SYSTEM up front for a wedding-destined turn (studio turns may name many).
        await assertIsolation(supabase, workspaceId, destWeddingId, system);
        const tools = conciergeTools(effectiveScope);
        const touched = new Set<string>();
        const resolved = new Set<string>();

        const result = await runConciergeTurn({
          system, history, userText: message, tools,
          exec: (name, input) => execTool({ supabase, scope: effectiveScope, workspaceId, touched, resolved }, name, input),
        });
        const answer = plain(result.text);

        // §F The isolation scan covers only what is PERSISTED to the thread — the planner message and
        // the concierge answer — plus the system. Raw tool outputs are never stored (saveMessage
        // persists content; history folds stored rows, never tool plumbing), so scanning them was
        // over-broad: it blocked a legitimate single-wedding turn whose model reached for a cross-
        // wedding tool. An answer that names another couple still refuses to land in a wedding thread.
        const persisted = `${system}\n${message}\n${answer}`;

        // ── §E/§F finalize the destination. A deferred studio turn whose SUBJECT is exactly one
        // wedding (read OR unambiguously resolved) and whose persisted text names no other couple
        // lands in that wedding's thread (its memory) — robust to which read tool the model used.
        // Otherwise it stays in the studio thread.
        if (destThreadId == null) {
          const cand = subjectWedding(touched, resolved);
          let target: string | null = null;
          if (cand && !(await scanOtherCouples(supabase, workspaceId, cand, persisted))) target = cand;
          destWeddingId = target;
          destThreadId = target
            ? await canonicalWeddingThread(supabase, workspaceId, target, user.id, message)
            : await createStudioThread(supabase, workspaceId, user.id, message);
          emit({ type: "thread", threadId: destThreadId });
          await saveMessage(supabase, destThreadId, "planner", message);
        } else {
          await assertIsolation(supabase, workspaceId, destWeddingId, persisted);
        }

        // Persist EACH draft and EACH proposed action as its own message row — no
        // card is droppable when the model creates several in one turn (finding 2).
        if (answer) await saveMessage(supabase, destThreadId, "concierge", answer);
        for (const d of result.drafts) await saveMessage(supabase, destThreadId, "concierge", "", { draft: d });
        const actionRows: { action: (typeof result.actions)[number]; id: string | null }[] = [];
        for (const a of result.actions) actionRows.push({ action: a, id: await saveMessage(supabase, destThreadId, "concierge", "", { action: a }) });
        await supabase.rpc("concierge_record_usage", { p_workspace: workspaceId, p_in: result.tokensIn, p_out: result.tokensOut });

        // stream: the answer text, then a card event per draft/action (each its own bubble message)
        const words = answer.split(/(\s+)/);
        for (const w of words) if (w) emit({ type: "token", text: w });
        for (const d of result.drafts) emit({ type: "draft", ...d });
        for (const { action, id } of actionRows) emit({ type: "action", messageId: id, ...action });
        emit({ type: "done", used: budget.used + result.tokensIn + result.tokensOut, cap: budget.cap });
        controller.close();
      } catch (e) {
        emit({ type: "error", message: e instanceof Error ? e.message : "failed" });
        controller.close();
      }
    },
  });

  return new NextResponse(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
