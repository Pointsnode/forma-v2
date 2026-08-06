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
  const { data: members } = await admin.from("wedding_members").select("user_id").eq("wedding_id", weddingId);
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
  const wl = (wd.locale as string | null) ?? "en";
  const studioUrl = `${APP_URL}${wl === "en" ? "" : `/${wl}`}/wedding/${weddingId}/design`;
  const mails = emails.map((to) => commentEmail({
    to, couple: wd.couple_display as string, planner: (prof?.display_name as string | null) ?? "Forma",
    imageUrl, studioUrl, body, locale: wl,
  }));
  await sendBatch(mails);
}
