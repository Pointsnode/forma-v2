import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PlatformRole = "owner" | "partner";
export type AdminGate =
  | { state: "signed-out" }
  | { state: "forbidden" } // signed in, not a platform admin
  | { state: "ok"; userId: string; role: PlatformRole };

// The single server-side gate for /admin. The admin layout renders sign-in / 404 / shell
// from this; every mutation route (later phases) re-checks with requireOwner. RLS returns
// the caller's platform_admins row iff they are an admin, and nothing otherwise.
export async function adminGate(): Promise<AdminGate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "signed-out" };
  const { data } = await supabase.from("platform_admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!data) return { state: "forbidden" };
  return { state: "ok", userId: user.id, role: data.role as PlatformRole };
}
