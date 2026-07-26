"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

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

  // RLS bootstrap: create the workspace (created_by = self), then seat self as
  // the first owner — both inserts permitted by 0001's policies.
  const slug = `${slugify(parsed.data.name)}-${crypto.randomUUID().slice(0, 6)}`;
  const { data: ws, error } = await supabase
    .from("workspaces")
    .insert({ kind: parsed.data.kind, name: parsed.data.name, slug, created_by: user.id })
    .select("id")
    .single();
  if (error || !ws) return { error: "generic" };
  const { error: mErr } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: ws.id, user_id: user.id, role: "owner" });
  if (mErr) return { error: "generic" };
  redirect({ href: "/", locale: await getLocale() });
  return null;
}
