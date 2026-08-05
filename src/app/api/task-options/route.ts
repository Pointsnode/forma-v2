import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace } from "@/lib/workspace";

// Options for the global quick-add sheet: workspace team members + vendors, and
// (when a wedding is chosen) that wedding's events. RLS scopes everything.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const weddingId = new URL(req.url).searchParams.get("weddingId");

  const workspaceId = (await currentWorkspace(supabase)) ?? "";

  const [{ data: members }, { data: vendors }, events] = await Promise.all([
    supabase.from("workspace_members").select("user_id, profiles(display_name)").eq("workspace_id", workspaceId),
    supabase.from("vendors").select("id, name").eq("workspace_id", workspaceId).order("name"),
    weddingId ? supabase.from("wedding_events").select("id, label").eq("wedding_id", weddingId).order("order_index") : Promise.resolve({ data: [] }),
  ]);
  return NextResponse.json({
    members: ((members ?? []) as unknown as { user_id: string; profiles: { display_name: string | null } | null }[]).map((m) => ({ id: m.user_id, name: m.profiles?.display_name ?? "·" })),
    vendors: ((vendors ?? []) as { id: string; name: string }[]).map((v) => ({ id: v.id, name: v.name })),
    events: ((events.data ?? []) as { id: string; label: string }[]).map((e) => ({ id: e.id, label: e.label })),
  });
}
