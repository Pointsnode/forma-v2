"use server";

import { createClient } from "@/lib/supabase/server";

export type MenuResult = { ok?: boolean; error?: string };

export async function submitMenuChoices(code: string, choices: { event_id: string; option_id: string | null }[]): Promise<MenuResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("menu_submit", { code, payload: { choices } });
  if (error) return { error: error.code || "generic" };
  return { ok: true };
}
