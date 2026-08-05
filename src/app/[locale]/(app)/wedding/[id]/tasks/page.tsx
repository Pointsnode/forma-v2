import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadWeddingBoard } from "@/lib/tasks";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { SectionTitle } from "@/components/ui";
import { TaskBoard, type BoardVM } from "@/components/tasks/board";

export default async function WeddingTasksTab({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role !== "staff") notFound(); // the board is a staff surface
  const { wedding, events } = ctx;
  const t = await getTranslations("tasks");

  const [board, { data: members }, { data: vendors }] = await Promise.all([
    loadWeddingBoard(supabase, id),
    supabase.from("workspace_members").select("user_id, profiles(display_name)").eq("workspace_id", wedding.workspace_id ?? ""),
    supabase.from("vendors").select("id, name").eq("workspace_id", wedding.workspace_id ?? "").order("name"),
  ]);
  const memberOpts = ((members ?? []) as unknown as { user_id: string; profiles: { display_name: string | null } | null }[]).map((m) => ({ id: m.user_id, name: m.profiles?.display_name ?? "·" }));
  const vendorOpts = ((vendors ?? []) as { id: string; name: string }[]).map((v) => ({ id: v.id, name: v.name }));
  const eventOpts = events.map((e) => ({ id: e.id, label: e.label }));

  return (
    <WeddingShell wedding={wedding} events={events} role="staff" active="tasks">
      <SectionTitle title={t("boardTitle")} accent={t("boardHint")} className="mt-0" />
      <TaskBoard board={board as BoardVM} weddingId={id} options={{ members: memberOpts, vendors: vendorOpts, events: eventOpts }} />
    </WeddingShell>
  );
}
