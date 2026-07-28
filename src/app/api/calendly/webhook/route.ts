import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/calendly/crypto.mjs";
import { verifyCalendlySignature } from "@/lib/calendly/webhook-verify.mjs";
import { normalizeInviteeEvent } from "@/lib/calendly/normalize.mjs";

// Calendly webhook — the anti-fetch-and-forget writer. The workspace rides in the
// callback URL (?w=<id>), set when we created the subscription; we load that
// connection, decrypt its signing key, and verify the signature BEFORE any DB write
// (Stripe precedent). invitee.created upserts a scheduled meeting; invitee.canceled
// flips the row to canceled (kept, never deleted). The upsert is idempotent on the
// (workspace, event, invitee) key, so replays/retries land on the same row. Service-
// role: a webhook has no session. Nothing here is anon — the anon matrix is untouched.
export async function POST(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get("w");
  const raw = await req.text();
  const sig = req.headers.get("calendly-webhook-signature");
  if (!workspaceId) return NextResponse.json({ error: "missing workspace" }, { status: 400 });

  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("calendly_connections")
    .select("webhook_signing_key_enc, status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!conn || conn.status !== "active" || !conn.webhook_signing_key_enc) {
    return NextResponse.json({ error: "no connection" }, { status: 404 });
  }

  const signingKey = decryptToken(conn.webhook_signing_key_enc as string);
  if (!verifyCalendlySignature(raw, sig, signingKey)) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const parsed = normalizeInviteeEvent(body);
  if (!parsed) return NextResponse.json({ received: true, ignored: true });

  const { error } = await admin
    .from("meetings")
    .upsert({ ...parsed.row, workspace_id: workspaceId }, { onConflict: "workspace_id,calendly_event_uri,calendly_invitee_uri" });
  if (error) return NextResponse.json({ error: "write failed" }, { status: 500 });

  return NextResponse.json({ received: true });
}
