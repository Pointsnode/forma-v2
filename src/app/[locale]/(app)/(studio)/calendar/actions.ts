"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deleteWebhookSubscription } from "@/lib/calendly/api";
import { getValidAccessToken } from "@/lib/calendly/tokens";

// Disconnect: delete the Calendly webhook subscription remotely (best-effort — a
// stale remote subscription must not trap the planner locally), then remove the
// connection row. Stored meetings are KEPT (history). Runs under the planner session.
export async function disconnectCalendly(): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: conn } = await supabase
    .from("calendly_connections")
    .select("id, access_token_enc, refresh_token_enc, token_expires_at, webhook_subscription_id")
    .limit(1)
    .maybeSingle();
  if (!conn) return { ok: true };

  try {
    if (conn.webhook_subscription_id) {
      const token = await getValidAccessToken(supabase, conn as { id: string; access_token_enc: string; refresh_token_enc: string; token_expires_at: string });
      await deleteWebhookSubscription(token, conn.webhook_subscription_id as string);
    }
  } catch (e) {
    console.error("calendly disconnect (remote) failed", e);
  }

  await supabase.from("calendly_connections").delete().eq("id", conn.id);
  revalidatePath("/calendar");
  return { ok: true };
}
