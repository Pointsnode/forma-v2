"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { createVendor, uploadVendorMedia, presentVendor, type VendorResult } from "@/app/[locale]/(app)/(studio)/vendors/actions";

const input = "w-full rounded-xl bg-bone px-3.5 py-2.5 text-[14px] text-ink shadow-card outline-none focus:shadow-lift";
const KINDS = ["venue", "catering", "florals", "music", "photo_video", "beauty", "decor", "rentals", "other"] as const;
const kindKey = (k: string) => `kind${k.charAt(0).toUpperCase()}${k.slice(1)}`;

export function AddVendorForm({ defaultKind = "other" }: { defaultKind?: string }) {
  const t = useTranslations("vendors");
  const [kind, setKind] = useState(defaultKind);
  const [state, action, pending] = useActionState<VendorResult, FormData>(async (_p, fd) => createVendor(fd), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("name")}</span><input name="name" required maxLength={200} className={input} /></label>
      <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("kind")}</span>
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
          {KINDS.map((k) => <option key={k} value={k}>{t(kindKey(k))}</option>)}
        </select></label>
      <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("description")}</span><textarea name="description" rows={2} className={input} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("tags")}</span><input name="tags" className={input} /></label>
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("cities")}</span><input name="cities" className={input} /></label>
      </div>
      {kind === "venue" ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("capacity")}</span><input name="capacity" inputMode="numeric" className={input} /></label>
          <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("address")}</span><input name="address" className={input} /></label>
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("contactName")}</span><input name="contact_name" className={input} /></label>
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("contactEmail")}</span><input name="contact_email" className={input} /></label>
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("contactPhone")}</span><input name="contact_phone" className={input} /></label>
      </div>
      {state?.error ? <p className="text-[13px] text-wine">{t("error")}</p> : null}
      <Button type="submit" disabled={pending}>{t("save")}</Button>
    </form>
  );
}

export function MediaUpload({ vendorId, kind }: { vendorId: string; kind: "photo" | "file" }) {
  const t = useTranslations("vendors");
  const [state, action, pending] = useActionState<VendorResult, FormData>(async (_p, fd) => uploadVendorMedia(vendorId, kind, fd), {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="file" name="file" required accept={kind === "photo" ? "image/*" : "image/*,application/pdf"} className="text-[13px]" />
      {kind === "file" ? (
        <select name="label" className="rounded-lg bg-bone px-2 py-1.5 text-[13px] shadow-card outline-none">
          {["packet", "rates", "menu", "other"].map((l) => <option key={l} value={l}>{t(`label${l.charAt(0).toUpperCase()}${l.slice(1)}`)}</option>)}
        </select>
      ) : null}
      <Button type="submit" variant="ghost" disabled={pending}>{pending ? t("uploading") : (kind === "photo" ? t("addPhoto") : t("addFile"))}</Button>
      {state?.error ? <span className="text-[12.5px] text-wine">{t("error")}</span> : null}
    </form>
  );
}

type Wedding = { id: string; couple_display: string; events: { id: string; label: string }[] };
export function PresentModal({ vendorId, weddings }: { vendorId: string; weddings: Wedding[] }) {
  const t = useTranslations("vendors");
  const [open, setOpen] = useState(false);
  const [weddingId, setWeddingId] = useState(weddings[0]?.id ?? "");
  const [events, setEvents] = useState<string[]>([]);
  const [estimate, setEstimate] = useState("");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const wedding = weddings.find((w) => w.id === weddingId);

  function submit() {
    if (!weddingId) return;
    setErr(null);
    start(async () => {
      const r = await presentVendor(vendorId, weddingId, events, estimate, note);
      if (r.error) setErr(t("error"));
      else { setToast(true); setOpen(false); setEvents([]); setEstimate(""); setNote(""); setTimeout(() => setToast(false), 2500); }
    });
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <Button onClick={() => setOpen(true)} disabled={!weddings.length}>{t("present")}</Button>
        {toast ? <span className="rounded-full bg-sage-soft px-3 py-1 text-[13px] text-sage-ink">{t("loopOpen")}</span> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-paper p-4 shadow-lift">
      <p className="font-display text-[17px] text-ink">{t("presentTitle")}</p>
      <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("pickWedding")}</span>
        <select value={weddingId} onChange={(e) => { setWeddingId(e.target.value); setEvents([]); }} className={input}>
          {weddings.map((w) => <option key={w.id} value={w.id}>{w.couple_display}</option>)}
        </select></label>
      {wedding && wedding.events.length ? (
        <div className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">{t("pickEvents")}</span>
          <div className="flex flex-wrap gap-2">
            {wedding.events.map((e) => {
              const on = events.includes(e.id);
              return (
                <button key={e.id} type="button"
                  onClick={() => setEvents(on ? events.filter((x) => x !== e.id) : [...events, e.id])}
                  className={`rounded-full px-3 py-1.5 text-[13px] ${on ? "bg-ink text-bone" : "bg-bone text-muted shadow-card"}`}>
                  {e.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("estimate")}</span><input value={estimate} onChange={(e) => setEstimate(e.target.value)} inputMode="numeric" className={input} /></label>
      </div>
      <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("note")}</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={input} /></label>
      {err ? <p className="text-[13px] text-wine">{err}</p> : null}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending || !weddingId}>{t("confirm")}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
      </div>
    </div>
  );
}
