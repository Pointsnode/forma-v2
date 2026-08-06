import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale, getLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { AddBoard, AddItem } from "@/components/wedding/design-controls";
import { PaletteRow, DrawSwatches, GuideCategory, SetCoverButton, PinControl, CommentLightbox, type LightboxComment } from "@/components/wedding/design-palette";
import { intlTag } from "@/lib/intl";
import { Card, Panel, PanelHead, Chip, Button, DomainStar, StudioTitleBand } from "@/components/ui";

type Item = { id: string; title: string; note: string | null; storage_path: string | null; sort: number };
type Board = { id: string; title: string; category: string | null; cover_item_id: string | null; budget_category: string | null; engagement_id: string | null; design_items: Item[] };

export default async function DesignTab({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role } = ctx;
  // §3/#37 — a couple sees the design tab in the WEDDING's language.
  if (role === "member" && wedding.locale && wedding.locale !== locale && (routing.locales as readonly string[]).includes(wedding.locale)) {
    redirect({ href: `/wedding/${id}/design`, locale: wedding.locale });
  }
  setRequestLocale(locale);
  const [t, td] = [await getTranslations("ops"), await getTranslations("design")];
  const lang = await getLocale();
  const canEdit = role === "staff" || role === "member";
  const isStaff = role === "staff";

  const [{ data: boardRows, error: boardErr }, { data: swatchRows }, { data: engRows }, { data: catRows }] = await Promise.all([
    // design_items!design_items_board_fk disambiguates the board→items relationship (the
    // cover_item_id FK adds a second design_boards↔design_items link).
    supabase.from("design_boards").select("id, title, category, cover_item_id, budget_category, engagement_id, design_items!design_items_board_fk(id, title, note, storage_path, sort)").eq("wedding_id", id).order("sort"),
    supabase.from("design_palette_swatches").select("id, hex, name").eq("wedding_id", id).order("sort").order("created_at"),
    isStaff ? supabase.from("wedding_vendors").select("id, vendors(name)").eq("wedding_id", id) : Promise.resolve({ data: [] }),
    isStaff ? supabase.from("ledger_lines").select("category").eq("wedding_id", id).not("category", "is", null) : Promise.resolve({ data: [] }),
  ]);
  // A query failure must not masquerade as an empty studio — log it, and the render shows
  // a real error state (not "No boards yet").
  if (boardErr) console.error(`design boards load (${boardErr.code}): ${boardErr.message}`);
  const boards = ((boardRows ?? []) as unknown as Board[]).map((b) => ({ ...b, design_items: [...b.design_items].sort((a, c) => a.sort - c.sort) }));
  const wedgeSwatches = (swatchRows ?? []) as { id: string; hex: string; name: string | null }[];
  const engagements = ((engRows ?? []) as unknown as { id: string; vendors: { name: string } | null }[]).map((e) => ({ id: e.id, name: e.vendors?.name ?? "·" }));
  const categories = [...new Set(((catRows ?? []) as { category: string }[]).map((r) => r.category))].filter(Boolean);

  // The studio palette (staff only), scoped to this wedding's workspace.
  let studioSwatches: { id: string; hex: string }[] = [];
  if (isStaff && wedding.workspace_id) {
    const { data } = await supabase.from("workspace_palette_swatches").select("id, hex").eq("workspace_id", wedding.workspace_id).order("sort").order("created_at").limit(40);
    studioSwatches = (data ?? []) as { id: string; hex: string }[];
  }

  const urls = new Map<string, string>();
  await Promise.all(boards.flatMap((b) => b.design_items).filter((i) => i.storage_path).map(async (i) => {
    const { data } = await supabase.storage.from("design-media").createSignedUrl(i.storage_path!, 3600);
    if (data?.signedUrl) urls.set(i.id, data.signedUrl);
  }));

  // Per-image comment threads (RLS-scoped to staff+couple of this wedding).
  const itemIds = boards.flatMap((b) => b.design_items.map((i) => i.id));
  const commentsByItem = new Map<string, LightboxComment[]>();
  if (itemIds.length) {
    const { data: crows } = await supabase
      .from("design_comments")
      .select("id, item_id, body, author_id, created_at, edited_at, profiles:author_id(display_name)")
      .in("item_id", itemIds).order("created_at");
    const dfmt = new Intl.DateTimeFormat(intlTag(lang), { month: "short", day: "numeric" });
    for (const c of (crows ?? []) as unknown as { id: string; item_id: string; body: string; author_id: string | null; created_at: string; edited_at: string | null; profiles: { display_name: string } | null }[]) {
      const list = commentsByItem.get(c.item_id) ?? [];
      list.push({ id: c.id, author: c.profiles?.display_name ?? "·", body: c.body, createdAt: dfmt.format(new Date(c.created_at)), edited: !!c.edited_at, mine: c.author_id === ctx.userId });
      commentsByItem.set(c.item_id, list);
    }
  }

  return (
    <WeddingShell wedding={wedding} events={events} role={role} active="design">
      <StudioTitleBand kicker={td("guides")} title={t("design")} accent={td("guidesHint")} />

      {/* Actions live in the bone room, not on the charcoal band (band actions read wrong). */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {canEdit ? <AddBoard weddingId={id} /> : null}
        {boards.length ? (
          <Link href={`/wedding/${id}/design/print`} target="_blank"><Button variant="ghost">{td("setTable")}</Button></Link>
        ) : null}
      </div>

      <PaletteRow weddingId={id} wedding={wedgeSwatches} studio={studioSwatches} canManage={canEdit} canKeep={isStaff} />

      {boardErr ? (
        <Card><p className="py-6 text-center font-accent text-[15px] text-[color:var(--color-text-danger)]">{t("uploadError")}</p></Card>
      ) : boards.length === 0 ? (
        <Card><p className="py-6 text-center font-accent text-[15px] text-text-meta">{t("noBoards")}</p></Card>
      ) : (
        <div className="flex flex-col gap-5">
          {boards.map((b) => {
            const cover = b.cover_item_id ? urls.get(b.cover_item_id) : undefined;
            return (
              <Panel key={b.id}>
                <PanelHead
                  star={<DomainStar fill="#8A7557" size={11} />}
                  title={
                    <span className="flex items-center gap-3">
                      {b.title}
                      {isStaff ? <GuideCategory boardId={b.id} weddingId={id} value={b.category} />
                        : b.category ? <span className="text-[10px] uppercase tracking-[0.16em] text-taupe">{b.category}</span> : null}
                    </span>
                  }
                  meta={
                    <span className="flex items-center gap-2.5">
                      {isStaff ? <PinControl boardId={b.id} weddingId={id} categories={categories} engagements={engagements} budgetCategory={b.budget_category} engagementId={b.engagement_id} />
                        : b.budget_category ? <Link href={`/wedding/${id}/budget`}><Chip tone="pending">{td("pinnedBudget", { name: b.budget_category })}</Chip></Link>
                        : b.engagement_id ? <Link href={`/wedding/${id}/vendors/${b.engagement_id}`}><Chip tone="pending">{engagements.find((e) => e.id === b.engagement_id)?.name ?? td("pinnedVendor", { name: "·" })}</Chip></Link>
                        : null}
                      <span>{t("pinCount", { count: b.design_items.length })}</span>
                      {canEdit ? <AddItem boardId={b.id} weddingId={id} /> : null}
                    </span>
                  }
                />
                <div className="p-[18px]">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="mb-3 h-40 w-full rounded-[var(--radius)] object-cover" />
                  ) : null}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {b.design_items.map((it) => {
                      const url = urls.get(it.id);
                      return (
                        <div key={it.id} className="overflow-hidden rounded-[var(--radius)] border border-hairline-token bg-surface-card">
                          {url ? (
                            <CommentLightbox item={{ id: it.id, title: it.title, url }} comments={commentsByItem.get(it.id) ?? []} weddingId={id} />
                          ) : <div className="h-24 bg-surface-card" />}
                          <div className="p-2.5">
                            <p className="font-display text-[14px] text-text-primary">{it.title}</p>
                            {it.note ? <p className="text-[11.5px] text-text-meta">{it.note}</p> : null}
                            {url ? (
                              <div className="mt-1.5 flex items-center justify-between gap-2">
                                <DrawSwatches weddingId={id} url={url} itemId={it.id} />
                                {isStaff ? <SetCoverButton boardId={b.id} weddingId={id} itemId={it.id} isCover={b.cover_item_id === it.id} /> : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </WeddingShell>
  );
}
