"use server";

import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { assembleContext, type Scope } from "@/lib/concierge/context";
import { runConciergeTurn } from "@/lib/concierge/agent";
import { conciergeConfigured } from "@/lib/concierge/config";
import { boardNudgeEmail } from "@/lib/email/board-nudge-email";
import { sendBatch } from "@/lib/email/resend";
import { APP_URL } from "@/lib/env";

// House style for the concierge in the rail: the message body renders as plain text, so the reply
// must be plain prose — no markdown, asterisks, bullet syntax, or em dashes (which would show as
// literal characters). Appended to the assembled system so the renderer stays dumb.
const BOARD_HOUSE_STYLE =
  "\n\nWrite your reply as plain prose for a chat message. Do not use markdown, asterisks, bullet lists, headings, or em dashes.";

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
    const turn = await runConciergeTurn({ system: ctx.system + BOARD_HOUSE_STYLE, history: [], userText: prompt, tools: [], exec: async () => ({ content: "" }), maxSteps: 1 });
    await post(turn.text?.trim() || t("conciergeNoAnswer"));
    return { ok: true };
  } catch {
    await post(t("conciergeError"));
    return { ok: true };
  }
}

// MSG-2 staff → couple: a planner posting in the client lane goes through here so the couple, who
// is not watching the rail, is reached by a branded email. board_post_client writes the message
// (member-or-staff gated, @concierge structurally absent); board_client_nudge decides whether an
// email is due (debounced one per wedding per hour) and returns the couple's addresses + language.
export async function postClientMessage(weddingId: string, body: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const trimmed = body.trim();
  if (!trimmed) return { error: "empty" };
  const { error } = await supabase.rpc("board_post_client", { p_wedding: weddingId, p_body: trimmed });
  if (error) return { error: error.message };
  try {
    const { data } = await supabase.rpc("board_client_nudge", { p_wedding: weddingId });
    const nudge = data as { due?: boolean; locale?: string; emails?: string[] } | null;
    if (nudge?.due && nudge.emails?.length) {
      const email = await boardNudgeEmail({ to: nudge.emails, url: `${APP_URL}/wedding/${weddingId}`, locale: nudge.locale ?? "en" });
      await sendBatch([email]);
    }
  } catch {
    // The message is already posted; a failed or skipped nudge must not fail the send.
  }
  return { ok: true };
}
