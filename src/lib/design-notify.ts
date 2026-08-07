import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBatch } from "@/lib/email/resend";
import { commentEmail } from "@/lib/email/design-comment-email";
import { APP_URL } from "@/lib/env";

// Notify the couple by email when the PLANNER comments on a design image (design studio v1).
// The service-role client is used ONLY to read couple auth-emails (not RLS-readable) and the
// image, then Resend sends. It fires strictly for a STAFF author on a comment the caller
// already authorized (RLS-inserted); it changes nothing and touches no anon surface. NOTE:
// EN/ES email copy; FR/IT fall back to EN until the email catalog namespace lands.
export async function notifyCoupleOfComment(weddingId: string, itemId: string, authorId: string | undefined, body: string): Promise<void> {
  if (!authorId) return;
  const admin = createAdminClient();
  const { data: wd } = await admin.from("weddings").select("workspace_id, couple_display, locale").eq("id", weddingId).maybeSingle();
  if (!wd?.workspace_id) return;
  // Only a planner (workspace staff) comment notifies the couple; a couple comment does not.
  const { data: staff } = await admin.from("workspace_members").select("user_id").eq("workspace_id", wd.workspace_id).eq("user_id", authorId).maybeSingle();
  if (!staff) return;
  const { data: prof } = await admin.from("profiles").select("display_name").eq("id", authorId).maybeSingle();
  const { data: ws } = await admin.from("workspaces").select("name, created_by").eq("id", wd.workspace_id).maybeSingle();
  // Only the COUPLE (partner members) get the note — never family or day-of coordinators.
  const { data: members } = await admin.from("wedding_members").select("user_id").eq("wedding_id", weddingId).eq("role", "partner");
  if (!members?.length) return;
  const emails: string[] = [];
  for (const m of members as { user_id: string }[]) {
    const { data } = await admin.auth.admin.getUserById(m.user_id);
    if (data?.user?.email) emails.push(data.user.email);
  }
  if (!emails.length) return;
  let imageUrl: string | null = null;
  const { data: item } = await admin.from("design_items").select("storage_path").eq("id", itemId).maybeSingle();
  if (item?.storage_path) {
    const { data } = await admin.storage.from("design-media").createSignedUrl(item.storage_path as string, 604800); // 7 days, for the email
    imageUrl = data?.signedUrl ?? null;
  }
  // #37 resolution, exactly as the lookups: wedding.locale → workspace creator's locale → 'en'.
  let wl = wd.locale as string | null;
  if (!wl && ws?.created_by) {
    const { data: cp } = await admin.from("profiles").select("locale").eq("id", ws.created_by as string).maybeSingle();
    wl = (cp?.locale as string | null) ?? null;
  }
  wl = wl ?? "en";
  // Planner name falls back to the STUDIO name (not the brand) so the couple sees who wrote.
  const plannerName = (prof?.display_name as string | null) ?? (ws?.name as string | null) ?? "";
  const studioUrl = `${APP_URL}${wl === "en" ? "" : `/${wl}`}/wedding/${weddingId}/design`;
  const mails = await Promise.all(emails.map((to) => commentEmail({
    to, couple: wd.couple_display as string, planner: plannerName,
    imageUrl, studioUrl, body, locale: wl,
  })));
  await sendBatch(mails);
}
