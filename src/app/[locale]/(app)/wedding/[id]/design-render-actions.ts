"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import {
  buildScenePrompt, composeScene, hasOpenAIKey,
  RENDERS_PER_WEDDING, RENDERS_PER_DAY, MAX_REF_IMAGES,
} from "@/lib/render/scene";

export type RenderResult = {
  ok?: boolean;
  error?: "no_key" | "forbidden" | "no_images" | "cap_wedding" | "cap_day" | "generic";
};

// "Set the scene" — staff-only, cost-guarded. Composes one concept image from the guide's own
// ingredients (its images, notes, category, the wedding palette + city) via gpt-image-2, lands
// it as a normal design item (origin='render') so the lightbox/comments/email/print work for
// free. The button also gates on these caps; this is the defense-in-depth re-check server-side.
export async function setScene(boardId: string, weddingId: string): Promise<RenderResult> {
  if (!hasOpenAIKey()) return { error: "no_key" };

  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, weddingId);
  if (!ctx || ctx.role !== "staff") return { error: "forbidden" }; // couples see results, never spend

  // Cap 1 — per wedding (lifetime): the budget the planner reasons about.
  const { count: wCount } = await supabase
    .from("design_items").select("id", { count: "exact", head: true })
    .eq("wedding_id", weddingId).eq("origin", "render");
  if ((wCount ?? 0) >= RENDERS_PER_WEDDING) return { error: "cap_wedding" };

  // Cap 2 — per studio per day (UTC): runaway protection across the workspace's weddings.
  if (ctx.wedding.workspace_id) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { data: wids } = await supabase.from("weddings").select("id").eq("workspace_id", ctx.wedding.workspace_id);
    const ids = (wids ?? []).map((w) => w.id as string);
    if (ids.length) {
      const { count: dCount } = await supabase
        .from("design_items").select("id", { count: "exact", head: true })
        .in("wedding_id", ids).eq("origin", "render").gte("created_at", dayStart.toISOString());
      if ((dCount ?? 0) >= RENDERS_PER_DAY) return { error: "cap_day" };
    }
  }

  // The guide + its ingredients (name the board→items relationship; a second FK exists).
  const { data: board } = await supabase
    .from("design_boards")
    .select("title, category, design_items!design_items_board_fk(title, note, storage_path, sort)")
    .eq("id", boardId).eq("wedding_id", weddingId).maybeSingle();
  if (!board) return { error: "forbidden" };
  const items = ((board.design_items ?? []) as { title: string; note: string | null; storage_path: string | null; sort: number }[])
    .slice().sort((a, b) => a.sort - b.sort);
  const withImages = items.filter((i) => i.storage_path);
  if (!withImages.length) return { error: "no_images" };

  const { data: sw } = await supabase.from("design_palette_swatches").select("hex").eq("wedding_id", weddingId).order("sort").order("created_at");
  const palette = ((sw ?? []) as { hex: string }[]).map((s) => s.hex);

  // Download up to 8 reference images from short-lived signed URLs (bucket is private).
  const refs: { data: Buffer; contentType: string }[] = [];
  for (const it of withImages.slice(0, MAX_REF_IMAGES)) {
    const { data: signed } = await supabase.storage.from("design-media").createSignedUrl(it.storage_path!, 600);
    if (!signed?.signedUrl) continue;
    try {
      const r = await fetch(signed.signedUrl);
      if (!r.ok) continue;
      refs.push({ data: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get("content-type") || "image/jpeg" });
    } catch { /* skip a single bad image, compose from the rest */ }
  }
  if (!refs.length) return { error: "no_images" };

  const prompt = buildScenePrompt({
    title: board.title as string,
    category: (board.category as string | null) ?? null,
    items,
    palette,
    city: ctx.wedding.location_city ?? null,
  });

  let png: Buffer;
  try {
    png = await composeScene({ prompt, images: refs, signal: AbortSignal.timeout(110_000) });
  } catch (e) {
    console.error(`setScene render: ${(e as Error).message}`);
    return { error: "generic" }; // quiet error line, never a crash
  }

  // Upload under {weddingId}/renders/… so the design-media RLS (first path segment = wedding
  // id) passes with the staff user client — no service-role needed.
  const path = `${weddingId}/renders/${crypto.randomUUID()}.png`;
  const { error: upErr } = await supabase.storage.from("design-media").upload(path, png, { contentType: "image/png" });
  if (upErr) { console.error(`setScene upload: ${upErr.message}`); return { error: "generic" }; }

  // Land it as a normal item at the end of the guide. Title in the wedding's language.
  const td = await getTranslations({ locale: ctx.wedding.locale ?? "en", namespace: "design" });
  const n = (wCount ?? 0) + 1;
  const maxSort = items.reduce((m, i) => Math.max(m, i.sort), 0);
  const { error: insErr } = await supabase.from("design_items").insert({
    board_id: boardId, wedding_id: weddingId,
    title: td("renderTitle", { n }), storage_path: path, origin: "render", sort: maxSort + 1,
  });
  if (insErr) { console.error(`setScene insert (${insErr.code}): ${insErr.message}`); return { error: "generic" }; }

  revalidatePath("/[locale]/(app)/wedding/[id]/design", "page");
  return { ok: true };
}
