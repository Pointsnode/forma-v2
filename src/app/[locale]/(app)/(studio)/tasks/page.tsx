import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace } from "@/lib/workspace";
import { SectionTitle, BentoBig, Check, heroToneAt } from "@/components/ui";
import { countdownDays, initials, type WeddingRow, type EventRow } from "@/lib/wedding";
import { loadGoalMesh, computeGoals } from "@/lib/goals";
import { loadMasterBoard } from "@/lib/tasks";
import { TaskBoard, type BoardVM } from "@/components/tasks/board";

// Two species, kept separate (§3): the computed What's-next moves (pulled, not
// maintained) sit ABOVE the manual master board.
export default async function TasksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tw = await getTranslations("wedding");
  const tg = await getTranslations("goals");
  const t = await getTranslations("tasks");
  const supabase = await createClient();

  const [wsId, { data: weds }] = await Promise.all([
    currentWorkspace(supabase),
    supabase.from("weddings").select("id, couple_display, phase, kind, location_city, location_country, date_start, date_end, guest_target, budget_total").order("date_start", { ascending: true, nullsFirst: false }),
  ]);
  const workspaceId = wsId ?? "";
  const weddings = (weds ?? []) as WeddingRow[];

  const nextMoves = new Map<string, { key: string; title: string; detail: string | null }[]>();
  await Promise.all(weddings.filter((w) => w.phase !== "closed").map(async (w) => {
    const { data: evs } = await supabase.from("wedding_events").select("id, label, kind, event_date, start_time, end_time, order_index, guest_target").eq("wedding_id", w.id).order("event_date", { ascending: true, nullsFirst: false });
    const groups = computeGoals(await loadGoalMesh(supabase, w, (evs ?? []) as EventRow[]), w.id, tg);
    const open = groups.filter((g) => !g.locked).flatMap((g) => g.goals).filter((g) => !g.done).slice(0, 3);
    nextMoves.set(w.id, open.map((g) => ({ key: g.key, title: g.title, detail: g.detail })));
  }));

  const [board, { data: members }, { data: vendors }] = await Promise.all([
    loadMasterBoard(supabase),
    supabase.from("workspace_members").select("user_id, profiles(display_name)").eq("workspace_id", workspaceId),
    supabase.from("vendors").select("id, name").eq("workspace_id", workspaceId).order("name"),
  ]);
  const memberOpts = ((members ?? []) as unknown as { user_id: string; profiles: { display_name: string | null } | null }[]).map((m) => ({ id: m.user_id, name: m.profiles?.display_name ?? "·" }));
  const vendorOpts = ((vendors ?? []) as { id: string; name: string }[]).map((v) => ({ id: v.id, name: v.name }));

  return (
    <div>
      <SectionTitle title={t("whatsNextSection")} accent={t("whatsNextHint")} className="mt-1" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {weddings.map((w, i) => {
          const days = countdownDays(w.date_start);
          const moves = nextMoves.get(w.id) ?? [];
          if (w.phase === "closed" || moves.length === 0) return null;
          return (
            <div key={w.id} className="flex flex-col overflow-hidden rounded-[var(--radius)] bg-bone">
              <div className="flex h-16 items-end justify-between p-3 text-[rgba(255,253,249,0.95)]" style={{ background: heroToneAt(i) }}>
                <BentoBig size={16}>{w.couple_display}</BentoBig>
                <span className="font-accent text-[13px] italic">{days != null ? (days >= 0 ? `${days} ${tw("days")}` : tw("daysAgo", { count: -days })) : ""}</span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                {moves.map((m) => (
                  <div key={m.key} className="flex items-start gap-2 py-1.5 not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline)]">
                    <Check ok={false} />
                    <div className="min-w-0"><p className="text-[13px] font-medium text-ink">{m.title}</p>{m.detail ? <p className="text-[11.5px] text-muted">{m.detail}</p> : null}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <SectionTitle title={t("masterTitle")} accent={t("masterHint")} className="mt-8" />
      <TaskBoard board={board as BoardVM} master workspaceId={workspaceId} options={{ members: memberOpts, vendors: vendorOpts, events: [] }}
        weddingsForFilter={weddings.map((w) => ({ id: w.id, name: w.couple_display, initials: initials(w.couple_display) }))} />
    </div>
  );
}
