"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { extractSwatches } from "@/lib/palette-extract.mjs";
import {
  addWeddingSwatch, removeWeddingSwatch, keepSwatchForStudio, pinGuide, updateGuide,
} from "@/app/[locale]/(app)/wedding/[id]/design-actions";

type Swatch = { id: string; hex: string; name: string | null };

// The wedding palette row + the studio palette beneath it. Hex shows on hover.
export function PaletteRow({ weddingId, wedding, studio, canManage, canKeep }: {
  weddingId: string; wedding: Swatch[]; studio: { id: string; hex: string }[]; canManage: boolean; canKeep: boolean;
}) {
  const t = useTranslations("design");
  const [, start] = useTransition();
  return (
    <div className="mb-6 border-b border-hairline pb-5">
      <p className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.24em] text-muted">{t("palette")}</p>
      {wedding.length === 0 ? (
        <p className="font-accent text-[14px] italic text-muted">{t("paletteEmpty")}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {wedding.map((s) => (
            <div key={s.id} className="group flex flex-col items-center">
              <span title={s.hex} className="block h-11 w-11 rounded-[var(--radius)] border border-hairline" style={{ background: s.hex }} />
              <span className="mt-1 text-[9px] tabular-nums text-muted opacity-0 transition-opacity group-hover:opacity-100">{s.hex}</span>
              {canManage ? (
                <div className="mt-0.5 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  {canKeep ? <button onClick={() => start(() => { keepSwatchForStudio(weddingId, s.hex); })} title={t("keepForStudio")} className="text-[10px] text-taupe hover:text-ink">★</button> : null}
                  <button onClick={() => start(() => { removeWeddingSwatch(s.id); })} title={t("removeSwatch")} className="text-[10px] text-muted hover:text-wine">✕</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {studio.length ? (
        <div className="mt-4">
          <p className="mb-1.5 text-[9.5px] uppercase tracking-[0.2em] text-muted">{t("studioPalette")}</p>
          <div className="flex flex-wrap gap-1.5">
            {studio.map((s) => <span key={s.id} title={s.hex} className="h-6 w-6 rounded-[var(--radius)] border border-hairline" style={{ background: s.hex }} />)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Per-image "draw swatches": load into a small canvas, extract 5 dominant colours, tap to
// save to the wedding palette. Needs a CORS-clean image (Supabase signed URLs are).
export function DrawSwatches({ weddingId, url, itemId }: { weddingId: string; url: string; itemId: string }) {
  const t = useTranslations("design");
  const [hexes, setHexes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  function draw() {
    setBusy(true);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 48; c.height = 48;
        const ctx = c.getContext("2d");
        if (!ctx) { setHexes([]); return; }
        ctx.drawImage(img, 0, 0, 48, 48);
        setHexes(extractSwatches(ctx.getImageData(0, 0, 48, 48).data, 5));
      } catch { setHexes([]); } finally { setBusy(false); }
    };
    img.onerror = () => { setHexes([]); setBusy(false); };
    img.src = url;
  }
  if (hexes === null) return <button onClick={draw} disabled={busy} className="text-[11px] text-muted hover:text-ink">{t("drawSwatches")}</button>;
  if (hexes.length === 0) return <span className="text-[11px] text-muted">·</span>;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9.5px] uppercase tracking-[0.12em] text-muted">{t("tapToSave")}</span>
      {hexes.map((h, i) => (
        <button key={i} title={h} onClick={() => start(() => { addWeddingSwatch(weddingId, h, itemId); })}
          className="h-5 w-5 rounded-[var(--radius)] border border-hairline transition-transform hover:scale-110" style={{ background: h }} />
      ))}
    </div>
  );
}

// Guide category — an inline editable text (staff/couple), with a datalist of suggestions.
export function GuideCategory({ boardId, weddingId, value }: { boardId: string; weddingId: string; value: string | null }) {
  const t = useTranslations("design");
  const [v, setV] = useState(value ?? "");
  const [, start] = useTransition();
  const listId = `cat-${boardId}`;
  return (
    <>
      <input list={listId} defaultValue={value ?? ""} placeholder={t("categoryPlaceholder")}
        onBlur={(e) => { const nv = e.target.value.trim(); if (nv !== (value ?? "")) start(() => { updateGuide(boardId, weddingId, { category: nv || null }); }); setV(nv); }}
        className="w-[150px] rounded-[var(--radius)] border border-hairline bg-bone px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-taupe outline-none focus:border-ink" />
      <datalist id={listId}>
        {["catMood", "catVenue", "catTablescape", "catFlorals", "catAttire", "catPaper"].map((k) => <option key={k} value={t(k)} />)}
      </datalist>
      <span className="hidden">{v}</span>
    </>
  );
}

// Set an image as the guide's cover.
export function SetCoverButton({ boardId, weddingId, itemId, isCover }: { boardId: string; weddingId: string; itemId: string; isCover: boolean }) {
  const t = useTranslations("design");
  const [, start] = useTransition();
  if (isCover) return <span className="text-[10px] uppercase tracking-[0.12em] text-champagne">{t("cover")}</span>;
  return <button onClick={() => start(() => { updateGuide(boardId, weddingId, { cover_item_id: itemId }); })} className="text-[10px] text-muted hover:text-ink">{t("setCover")}</button>;
}

// Pin a guide to a budget category or a vendor engagement (staff). Read-only chip elsewhere.
export function PinControl({ boardId, weddingId, categories, engagements, budgetCategory, engagementId }: {
  boardId: string; weddingId: string; categories: string[]; engagements: { id: string; name: string }[]; budgetCategory: string | null; engagementId: string | null;
}) {
  const t = useTranslations("design");
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const pinned = budgetCategory || engagementId;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="rounded-[var(--radius)] border border-taupe px-2.5 py-[3px] text-[9.5px] font-medium uppercase tracking-[0.14em] text-taupe hover:text-ink">
        {pinned ? (budgetCategory ? t("pinnedBudget", { name: budgetCategory }) : t("pinnedVendor", { name: engagements.find((e) => e.id === engagementId)?.name ?? "·" })) : `+ ${t("pinTo")}`}
      </button>
      {open ? (
        <div className="absolute right-0 top-8 z-20 w-[220px] rounded-[var(--radius)] border border-hairline bg-bone p-2.5">
          <select defaultValue={budgetCategory ?? ""} onChange={(e) => start(() => { pinGuide(boardId, weddingId, e.target.value || null, null); setOpen(false); })}
            className="mb-1.5 w-full rounded-[var(--radius)] border border-hairline bg-bone px-2 py-1 text-[12px] outline-none">
            <option value="">{t("category")}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select defaultValue={engagementId ?? ""} onChange={(e) => start(() => { pinGuide(boardId, weddingId, null, e.target.value || null); setOpen(false); })}
            className="w-full rounded-[var(--radius)] border border-hairline bg-bone px-2 py-1 text-[12px] outline-none">
            <option value="">·</option>
            {engagements.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {pinned ? <button onClick={() => start(() => { pinGuide(boardId, weddingId, null, null); setOpen(false); })} className="mt-1.5 text-[11px] text-wine">{t("unpin")}</button> : null}
        </div>
      ) : null}
    </div>
  );
}
