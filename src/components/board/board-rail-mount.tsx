import { createClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";
import { BoardRail } from "./board-rail";

// Server mount: loads the caller's board summary + roster (RLS/DEFINER), then renders the client
// rail. Mounted once in (app)/layout so the Board is on every studio AND wedding window.
export async function BoardRailMount({ workspaceId, selfId, weddings, locale }: {
  workspaceId: string; selfId: string; weddings: { id: string; name: string }[]; locale: string;
}) {
  const supabase = await createClient();
  const [{ data: summary }, { data: roster }] = await Promise.all([
    supabase.rpc("board_summary", { p_workspace: workspaceId }),
    supabase.rpc("board_roster", { p_workspace: workspaceId }),
  ]);
  const linkBase = locale === routing.defaultLocale ? "" : `/${locale}`;
  return (
    <BoardRail
      workspaceId={workspaceId}
      selfId={selfId}
      weddings={weddings}
      roster={(Array.isArray(roster) ? roster : []) as { user_id: string; name: string | null }[]}
      initialSummary={(summary as { notifications: number; threads: { wedding_id: string | null; unread: number }[] }) ?? { notifications: 0, threads: [] }}
      linkBase={linkBase}
    />
  );
}
