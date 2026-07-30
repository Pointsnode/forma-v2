import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace as firstWorkspace, clearanceGate } from "@/lib/workspace";
import { conciergeConfigured } from "@/lib/concierge/config";
import { assembleContext, type Scope } from "@/lib/concierge/context";
import { conciergeTools, execTool } from "@/lib/concierge/tools";
import { runConciergeTurn } from "@/lib/concierge/agent";
import { loadBudget, loadThread, saveMessage, assertIsolation, listThreads, loadThreadMessages } from "@/lib/concierge/session";

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
        const { threadId, history } = await loadThread(supabase, { threadId: body.threadId ?? null, scope, workspaceId, userId: user.id, firstMessage: message });
        emit({ type: "thread", threadId });
        await saveMessage(supabase, threadId, "planner", message);

        // budget refusal — honest, no model call (Decision F)
        if (budget.over) {
          const refusal = "I've used this month's included thinking. Raise the cap in the concierge settings and I'll pick right back up.";
          await saveMessage(supabase, threadId, "concierge", refusal);
          emit({ type: "token", text: refusal });
          emit({ type: "done", used: budget.used, cap: budget.cap, over: true });
          controller.close();
          return;
        }

        // keyless — degrade honestly (the key is the studio's to paste)
        if (!conciergeConfigured()) {
          const notice = "The concierge isn't configured yet — the studio needs to add its model key. Your message is saved.";
          await saveMessage(supabase, threadId, "concierge", notice);
          emit({ type: "token", text: notice });
          emit({ type: "done", used: budget.used, cap: budget.cap, notConfigured: true });
          controller.close();
          return;
        }

        const { system } = await assembleContext(supabase, scope, locale);
        await assertIsolation(supabase, system, scope);
        const tools = conciergeTools(scope);

        const result = await runConciergeTurn({
          system, history, userText: message, tools,
          exec: (name, input) => execTool({ supabase, scope, workspaceId }, name, input),
        });

        // Persist EACH draft and EACH proposed action as its own message row — no
        // card is droppable when the model creates several in one turn (finding 2).
        const answer = plain(result.text);
        if (answer) await saveMessage(supabase, threadId, "concierge", answer);
        for (const d of result.drafts) await saveMessage(supabase, threadId, "concierge", "", { draft: d });
        const actionRows: { action: (typeof result.actions)[number]; id: string | null }[] = [];
        for (const a of result.actions) actionRows.push({ action: a, id: await saveMessage(supabase, threadId, "concierge", "", { action: a }) });
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
