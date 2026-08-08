"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { REFERRAL_COOKIE } from "@/lib/referral";

export type WorkspaceState = { error?: "invalid" | "generic" } | null;

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";

export async function createWorkspace(_prev: WorkspaceState, formData: FormData): Promise<WorkspaceState> {
  const parsed = z
    .object({ name: z.string().trim().min(1).max(120), kind: z.enum(["studio", "couple"]) })
    .safeParse({ name: formData.get("name"), kind: formData.get("kind") });
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "generic" };

  // RLS bootstrap WITHOUT a read-back. The workspaces SELECT policy is
  // is_workspace_member(id), and the creator is not a member yet at insert
  // time, so any RETURNING (a .select() on the insert) is evaluated against
  // that policy, reads back zero rows, and the insert dies atomically with
  // SQLSTATE 42501 — nothing persists. So we generate the id here, insert with
  // NO returning, then seat self as the first owner. By the next request the
  // creator is a member and every subsequent select passes.
  const id = crypto.randomUUID();
  const base = slugify(parsed.data.name);
  let inserted = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = `${base}-${crypto.randomUUID().slice(0, 6)}`;
    const { error } = await supabase
      .from("workspaces")
      .insert({ id, kind: parsed.data.kind, name: parsed.data.name, slug, created_by: user.id });
    if (!error) {
      inserted = true;
      break;
    }
    if (error.code === "23505") continue; // slug collision — new suffix, retry
    console.error(`createWorkspace: workspace insert failed (${error.code}): ${error.message}`);
    return { error: "generic" };
  }
  if (!inserted) {
    console.error("createWorkspace: workspace insert failed: unique slug not found after 5 attempts");
    return { error: "generic" };
  }
  const { error: mErr } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: id, user_id: user.id, role: "owner" });
  if (mErr) {
    console.error(`createWorkspace: membership insert failed (${mErr.code}): ${mErr.message}`);
    return { error: "generic" };
  }

  // REF-1: a studio that signed up through a referral link records the referral now (the caller
  // is the new owner, so the member-gated DEFINER admits it). record_referral is a silent no-op
  // on a missing/invalid/self code or either interlock. The cookie is cleared either way.
  if (parsed.data.kind === "studio") {
    const jar = await cookies();
    const code = jar.get(REFERRAL_COOKIE)?.value;
    if (code) {
      await supabase.rpc("record_referral", { p_referred: id, p_code: code });
      jar.delete(REFERRAL_COOKIE);
    }
  }

  redirect({ href: "/", locale: await getLocale() });
  return null;
}
