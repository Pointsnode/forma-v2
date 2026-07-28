import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { conciergeConfigured } from "@/lib/concierge/config";
import { assembleContext, type Scope } from "@/lib/concierge/context";
import { conciergeTools, execTool } from "@/lib/concierge/tools";
import { runConciergeTurn, type DraftRef } from "@/lib/concierge/agent";
import { loadBudget, loadThread, saveMessage, assertIsolation } from "@/lib/concierge/session";

// Node runtime (server session + no edge). The concierge acts through the signed-in
// planner's RLS session — no service-role here, so this route is NOT on the
// service-role allowlist.
export const dynamic = "force-dynamic";

type Body = { threadId?: string | null; scope?: { weddingId?: string | null } | null; message?: string };

const line = (o: unknown) => new TextEncoder().encode(JSON.stringify(o) + "\n");

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "empty" }, { status: 400 });
  const scope: Scope = body.scope?.weddingId ? { kind: "wedding", weddingId: body.scope.weddingId } : { kind: "orchestrator" };

  const { data: wsRow } = await supabase.from("workspace_members").select("workspace_id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  const workspaceId = (wsRow?.workspace_id as string) ?? null;
  if (!workspaceId) return NextResponse.json({ error: "no_workspace" }, { status: 403 });

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

        const { system } = await assembleContext(supabase, scope);
        await assertIsolation(supabase, system, scope);
        const tools = conciergeTools(scope);

        const result = await runConciergeTurn({
          system, history, userText: message, tools,
          exec: (name, input) => execTool({ supabase, scope, workspaceId }, name, input),
        });

        const draft: DraftRef | null = result.drafts[result.drafts.length - 1] ?? null;
        await saveMessage(supabase, threadId, "concierge", result.text, draft);
        await supabase.rpc("concierge_record_usage", { p_workspace: workspaceId, p_in: result.tokensIn, p_out: result.tokensOut });

        // stream the answer in word chunks for a live feel
        const words = result.text.split(/(\s+)/);
        for (const w of words) if (w) emit({ type: "token", text: w });
        for (const d of result.drafts) emit({ type: "draft", ...d });
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
