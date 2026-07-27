import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { AddBoard, AddItem } from "@/components/wedding/design-controls";
import { Card, SectionTitle, heroToneAt } from "@/components/ui";

export default async function DesignTab({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role } = ctx;
  const t = await getTranslations("ops");
  // day_of can't see design (RLS billing-member); couples can (read-write)
  const canEdit = role === "staff" || role === "member";

  const { data: boardRows } = await supabase.from("design_boards").select("id, title, design_items(id, title, note, storage_path, event_id)").eq("wedding_id", id).order("sort");
  const boards = (boardRows ?? []) as unknown as { id: string; title: string; design_items: { id: string; title: string; note: string | null; storage_path: string | null; event_id: string | null }[] }[];

  const urls = new Map<string, string>();
  await Promise.all(boards.flatMap((b) => b.design_items).filter((i) => i.storage_path).map(async (i) => {
    const { data } = await supabase.storage.from("design-media").createSignedUrl(i.storage_path!, 3600);
    if (data?.signedUrl) urls.set(i.id, data.signedUrl);
  }));

  return (
    <WeddingShell wedding={wedding} events={events} role={role} active="design">
      <SectionTitle title={t("design")} accent={t("designHint")} action={canEdit ? <AddBoard weddingId={id} /> : undefined} className="mt-0" />
      {boards.length === 0 ? (
        <Card><p className="py-6 text-center font-accent text-[15px] text-muted">{t("noBoards")}</p></Card>
      ) : (
        <div className="flex flex-col gap-5">
          {boards.map((b, bi) => (
            <Card key={b.id}>
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="font-display text-[19px] text-ink">{b.title} <span className="ml-1 text-[12px] font-normal text-muted">{t("pinCount", { count: b.design_items.length })}</span></h3>
                {canEdit ? <AddItem boardId={b.id} weddingId={id} /> : null}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {b.design_items.map((it, ii) => {
                  const url = urls.get(it.id);
                  return (
                    <div key={it.id} className="overflow-hidden rounded-xl bg-paper shadow-card">
                      <div className="relative flex h-24 items-end p-2 text-[rgba(255,253,249,0.95)]" style={{ background: heroToneAt(bi + ii) }}>
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt={it.title} className="absolute inset-0 h-24 w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="p-2.5">
                        <p className="font-display text-[14px] text-ink">{it.title}</p>
                        {it.note ? <p className="text-[11.5px] text-muted">{it.note}</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </WeddingShell>
  );
}
