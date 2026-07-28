import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executeApproval } from "@/lib/concierge/approval";

export const dynamic = "force-dynamic";

type Body = { messageId?: string; decision?: "approve" | "dismiss" };

// Approve/Dismiss a pending-action card. Runs under the planner's RLS session — no
// service-role, no acting_as_concierge flag, so the executed action's activity is
// stamped 'user' (the planner did it; the thread carries the provenance). Re-checks
// the card is still pending (idempotent) and renders the function's own refusal on
// failure.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { messageId, decision } = (await req.json().catch(() => ({}))) as Body;
  if (!messageId || (decision !== "approve" && decision !== "dismiss")) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // RLS scopes this to the planner's workspace threads.
  const { data: msg } = await supabase.from("concierge_messages").select("id, action_ref").eq("id", messageId).maybeSingle();
  const action = (msg?.action_ref ?? null) as { fn: string; args: Record<string, unknown>; summary: string; status: string } | null;
  if (!msg || !action) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (action.status !== "pending") return NextResponse.json({ status: action.status }); // already resolved — idempotent

  const nowIso = new Date().toISOString();
  if (decision === "dismiss") {
    const next = { ...action, status: "dismissed", resolved_at: nowIso };
    await supabase.from("concierge_messages").update({ action_ref: next }).eq("id", messageId);
    return NextResponse.json({ status: "dismissed" });
  }

  const r = await executeApproval(supabase, action.fn, action.args);
  const errorMsg = r.ok ? undefined : (r.message || r.error || "failed");
  const next = { ...action, status: r.ok ? "approved" : "failed", error: errorMsg, resolved_at: nowIso };
  await supabase.from("concierge_messages").update({ action_ref: next }).eq("id", messageId);
  return NextResponse.json({ status: next.status, error: errorMsg });
}
