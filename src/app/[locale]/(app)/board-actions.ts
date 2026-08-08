"use server";

import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { assembleContext, type Scope } from "@/lib/concierge/context";
import { runConciergeTurn } from "@/lib/concierge/agent";
import { conciergeConfigured } from "@/lib/concierge/config";

// MSG-1 @concierge: a team-lane mention calls the existing concierge brain with the thread's
// scope as context, ASSEMBLED UNDER THE ASKER'S OWN RLS SESSION (so money the asker cannot see
// never enters the prompt — the context-assembly money-scoping). The reply posts as
// author_kind='concierge' via the member-gated DEFINER (un-editable, reactable, taskable).
export async function askConcierge(workspaceId: string, weddingId: string | null, prompt: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const t = await getTranslations("board");
  const post = (body: string) => supabase.rpc("board_post_concierge", { p_workspace: workspaceId, p_wedding: weddingId, p_body: body });

  if (!conciergeConfigured()) { await post(t("conciergeNotConfigured")); return { ok: true }; }
  try {
    const scope: Scope = weddingId ? { kind: "wedding", weddingId } : { kind: "orchestrator" };
    const ctx = await assembleContext(supabase, scope);
    const turn = await runConciergeTurn({ system: ctx.system, history: [], userText: prompt, tools: [], exec: async () => ({ content: "" }), maxSteps: 1 });
    await post(turn.text?.trim() || t("conciergeNoAnswer"));
    return { ok: true };
  } catch {
    await post(t("conciergeError"));
    return { ok: true };
  }
}
