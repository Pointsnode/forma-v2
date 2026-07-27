"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, cx } from "@/components/ui";
import { createVendor, uploadVendorMedia, presentVendor, type VendorResult } from "@/app/[locale]/(app)/(studio)/vendors/actions";

const input = "w-full rounded-xl bg-bone px-3.5 py-2.5 text-[14px] text-ink shadow-card outline-none focus:shadow-lift";
const mlbl = "mt-4 block text-[10.5px] uppercase tracking-[0.14em] text-muted";
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
// The Present modal — prototype v1.9's flow: to a wedding, for an event, this
// opens the loop. Overlay + mbox; on success a toast confirms the ball is in
// their court.
export function PresentModal({ vendorId, vendorName, vendorKind, weddings }: { vendorId: string; vendorName: string; vendorKind: string; weddings: Wedding[] }) {
  const t = useTranslations("vendors");
  const [open, setOpen] = useState(false);
  const [weddingId, setWeddingId] = useState(weddings[0]?.id ?? "");
  const [events, setEvents] = useState<string[]>([]);
  const [estimate, setEstimate] = useState("");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const wedding = weddings.find((w) => w.id === weddingId);
  const isVenue = vendorKind === "venue";
  // Single-event law: with one event the engagement auto-attaches — no chips. The
  // chip picker appears only for multi-event weddings.
  const multiEvent = (wedding?.events.length ?? 0) >= 2;

  function close() { setOpen(false); setErr(null); }
  function submit() {
    if (!weddingId) return;
    // A venue on a multi-event wedding must name at least one event (mirrors FV244).
    if (isVenue && multiEvent && events.length === 0) { setErr(t("needEvent")); return; }
    setErr(null);
    start(async () => {
      const r = await presentVendor(vendorId, weddingId, events, estimate, note);
      if (r.error) setErr(r.error === "FV244" ? t("needEvent") : t("error"));
      else {
        close(); setEvents([]); setEstimate(""); setNote("");
        setToast(t("loopOpenToast", { vendor: vendorName }));
        setTimeout(() => setToast(null), 4200);
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!weddings.length}>{t("present")}</Button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button aria-hidden className="absolute inset-0 cursor-default bg-[rgba(21,18,16,0.55)]" onClick={close} />
          <div className="relative w-full max-w-[530px] rounded-[18px] bg-paper p-7 shadow-hero">
            <h3 className="font-display text-[23px] text-ink">{t("presentVendor", { vendor: vendorName })}</h3>
            <p className="mb-2 mt-0.5 font-accent text-[15px] italic text-taupe">{t("presentSub")}</p>

            <label className={mlbl}>{t("pickWedding")}</label>
            <select value={weddingId} onChange={(e) => { setWeddingId(e.target.value); setEvents([]); }} className={cx(input, "mt-1.5")}>
              {weddings.map((w) => <option key={w.id} value={w.id}>{w.couple_display}</option>)}
            </select>

            {multiEvent ? (
              <>
                <label className={mlbl}>{t("pickEvents")}{isVenue ? <span className="ml-1.5 lowercase tracking-normal text-wine">· {t("eventRequired")}</span> : null}</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {wedding!.events.map((e) => {
                    const on = events.includes(e.id);
                    return (
                      <button key={e.id} type="button"
                        onClick={() => setEvents(on ? events.filter((x) => x !== e.id) : [...events, e.id])}
                        className={cx("rounded-full px-3.5 py-1.5 text-[12px]", on ? "bg-ink text-bone" : "bg-sand-soft text-ink-soft")}>
                        {e.label}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : wedding && wedding.events.length === 1 ? (
              <p className="mt-3 font-accent text-[13.5px] italic text-taupe">{t("autoAttach", { event: wedding.events[0].label })}</p>
            ) : null}

            <label className={mlbl}>{t("estimate")}</label>
            <input value={estimate} onChange={(e) => setEstimate(e.target.value)} inputMode="numeric" className={cx(input, "mt-1.5")} placeholder="$ —" />

            <label className={mlbl}>{t("note")}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={cx(input, "mt-1.5 min-h-16 resize-y")} />

            {err ? <p className="mt-2 text-[13px] text-wine">{err}</p> : null}
            <div className="mt-5 flex justify-end gap-2.5">
              <Button variant="ghost" onClick={close}>{t("cancel")}</Button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !weddingId}
                className="inline-flex items-center justify-center rounded-full bg-wine px-5 py-2.5 text-[14px] font-medium text-bone transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {t("confirmSend")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-16 left-1/2 z-[95] w-max max-w-[92vw] -translate-x-1/2 rounded-full bg-ink px-6 py-3 text-center text-[12.5px] text-bone shadow-hero">
          {toast}
        </div>
      ) : null}
    </>
  );
}
