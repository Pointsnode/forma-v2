import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { formatDateRange } from "@/lib/wedding";
import { DomainStar, Wordmark } from "@/components/ui";
import { PrintButton } from "../../budget/print/print-button";

type Item = { id: string; title: string; note: string | null; storage_path: string | null; sort: number };
type Board = { id: string; title: string; category: string | null; design_items: Item[] };

// "Set the table" — a print-optimized design export in Edition One, ALWAYS bone, rendered
// in the WEDDING's language: a cover (couple + star), the palette row, then each guide with
// its images and notes, for browser print-to-PDF. The tokenized vendor share LINK is
// deliberately NOT built here (it would touch the anon matrix; own decision later). Staff +
// couple only (loadWeddingContext gates); no anon.
export default async function DesignPrint({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding } = ctx;
  const viewer = await getLocale();
  const wl = (wedding.locale as string | null) ?? viewer;
  const td = await getTranslations({ locale: wl, namespace: "design" });

  const [{ data: boardRows }, { data: swatchRows }] = await Promise.all([
    supabase.from("design_boards").select("id, title, category, design_items(id, title, note, storage_path, sort)").eq("wedding_id", id).order("sort"),
    supabase.from("design_palette_swatches").select("id, hex").eq("wedding_id", id).order("sort").order("created_at"),
  ]);
  const boards = ((boardRows ?? []) as unknown as Board[]).map((b) => ({ ...b, design_items: [...b.design_items].sort((a, c) => a.sort - c.sort) }));
  const swatches = (swatchRows ?? []) as { id: string; hex: string }[];
  const range = formatDateRange(wedding.date_start, wedding.date_end, wl);

  const urls = new Map<string, string>();
  await Promise.all(boards.flatMap((b) => b.design_items).filter((i) => i.storage_path).map(async (i) => {
    const { data } = await supabase.storage.from("design-media").createSignedUrl(i.storage_path!, 3600);
    if (data?.signedUrl) urls.set(i.id, data.signedUrl);
  }));

  return (
    <div className="min-h-screen bg-bone px-8 py-12 text-ink print:px-0 print:py-0">
      <div className="mx-auto max-w-[820px]">
        {/* Cover */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <DomainStar fill="#111111" size={20} />
            <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.24em] text-taupe">{td("printKicker")}</p>
            <h1 className="mt-1 font-display text-[36px] leading-none text-ink">{wedding.couple_display}</h1>
            {range ? <p className="mt-1.5 font-accent text-[17px] italic text-taupe">{range}</p> : null}
          </div>
          <div className="flex flex-col items-end gap-3">
            <Wordmark size={20} />
            <PrintButton label={td("setTable")} />
          </div>
        </div>

        {/* Palette row */}
        {swatches.length ? (
          <div className="mb-8 flex flex-wrap gap-2 border-y border-hairline py-4">
            {swatches.map((s) => (
              <span key={s.id} className="flex flex-col items-center">
                <span className="h-10 w-10 rounded-[var(--radius)] border border-hairline" style={{ background: s.hex }} />
                <span className="mt-1 text-[9px] tabular-nums text-muted">{s.hex}</span>
              </span>
            ))}
          </div>
        ) : null}

        {/* Guides */}
        <div className="flex flex-col gap-10">
          {boards.map((b) => (
            <section key={b.id} className="break-inside-avoid">
              <div className="mb-3 flex items-baseline gap-3 border-b border-hairline pb-2">
                <h2 className="font-display text-[22px] text-ink">{b.title}</h2>
                {b.category ? <span className="text-[10px] uppercase tracking-[0.16em] text-taupe">{b.category}</span> : null}
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {b.design_items.map((it) => {
                  const url = urls.get(it.id);
                  return (
                    <div key={it.id} className="break-inside-avoid">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt={it.title} className="h-40 w-full rounded-[var(--radius)] border border-hairline object-cover" />
                      ) : <div className="h-40 w-full rounded-[var(--radius)] border border-hairline bg-bone" />}
                      <p className="mt-1.5 font-display text-[14px] text-ink">{it.title}</p>
                      {it.note ? <p className="text-[12px] text-muted">{it.note}</p> : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
