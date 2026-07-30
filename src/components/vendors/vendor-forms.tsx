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

type EventOpt = { id: string; label: string };
type Wedding = { id: string; couple_display: string; events: EventOpt[] };

// The shared estimate + event-chips + note form — ONE component, ONE action, ONE
// RPC, behind BOTH doorways (studio: fixed vendor, picks the wedding; wedding tab:
// fixed wedding, picks the vendor). The FV244 client mirror lives here unchanged.
export function PresentForm({ vendorKind, weddingId, events, onDone, doPresent }: {
  vendorKind: string; weddingId: string; events: EventOpt[];
  onDone: () => void;
  doPresent: (eventIds: string[], estimate: string, note: string) => Promise<VendorResult>;
}) {
  const t = useTranslations("vendors");
  const [selEvents, setSelEvents] = useState<string[]>([]);
  const [estimate, setEstimate] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isVenue = vendorKind === "venue";
  const multiEvent = events.length >= 2; // single-event law: 1 event auto-attaches, no chips

  function submit() {
    if (!weddingId) return;
    if (isVenue && multiEvent && selEvents.length === 0) { setErr(t("needEvent")); return; } // mirrors FV244
    setErr(null);
    start(async () => {
      const r = await doPresent(selEvents, estimate, note);
      if (r.error) setErr(r.error === "FV244" ? t("needEvent") : t("error"));
      else onDone();
    });
  }

  return (
    <div>
      {multiEvent ? (
        <>
          <label className={mlbl}>{t("pickEvents")}{isVenue ? <span className="ml-1.5 lowercase tracking-normal text-wine">· {t("eventRequired")}</span> : null}</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {events.map((e) => {
              const on = selEvents.includes(e.id);
              return (
                <button key={e.id} type="button" onClick={() => setSelEvents(on ? selEvents.filter((x) => x !== e.id) : [...selEvents, e.id])}
                  className={cx("rounded-full px-3.5 py-1.5 text-[12px]", on ? "bg-ink text-bone" : "bg-sand-soft text-ink-soft")}>{e.label}</button>
              );
            })}
          </div>
        </>
      ) : events.length === 1 ? (
        <p className="mt-3 font-accent text-[13.5px] italic text-taupe">{t("autoAttach", { event: events[0].label })}</p>
      ) : null}

      <label className={mlbl}>{t("estimate")}</label>
      <input value={estimate} onChange={(e) => setEstimate(e.target.value)} inputMode="numeric" className={cx(input, "mt-1.5")} placeholder="$ —" />
      <label className={mlbl}>{t("note")}</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={cx(input, "mt-1.5 min-h-16 resize-y")} />

      {err ? <p className="mt-2 text-[13px] text-wine">{err}</p> : null}
      <div className="mt-5 flex justify-end gap-2.5">
        <button type="button" onClick={submit} disabled={pending || !weddingId}
          className="inline-flex items-center justify-center rounded-full bg-wine px-5 py-2.5 text-[14px] font-medium text-bone transition-opacity hover:opacity-90 disabled:opacity-50">{t("confirmSend")}</button>
      </div>
    </div>
  );
}

// Studio doorway: fixed vendor, picks the wedding, then the shared PresentForm.
export function PresentModal({ vendorId, vendorName, vendorKind, weddings }: { vendorId: string; vendorName: string; vendorKind: string; weddings: Wedding[] }) {
  const t = useTranslations("vendors");
  const [open, setOpen] = useState(false);
  const [weddingId, setWeddingId] = useState(weddings[0]?.id ?? "");
  const [toast, setToast] = useState<string | null>(null);
  const wedding = weddings.find((w) => w.id === weddingId);

  function done() {
    setOpen(false);
    setToast(t("loopOpenToast", { vendor: vendorName }));
    setTimeout(() => setToast(null), 4200);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!weddings.length}>{t("present")}</Button>
      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button aria-hidden className="absolute inset-0 cursor-default bg-[rgba(21,18,16,0.55)]" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-[530px] rounded-[18px] bg-paper p-7 shadow-hero">
            <h3 className="font-display text-[23px] text-ink">{t("presentVendor", { vendor: vendorName })}</h3>
            <p className="mb-2 mt-0.5 font-accent text-[15px] italic text-taupe">{t("presentSub")}</p>
            <label className={mlbl}>{t("pickWedding")}</label>
            <select value={weddingId} onChange={(e) => setWeddingId(e.target.value)} className={cx(input, "mt-1.5")}>
              {weddings.map((w) => <option key={w.id} value={w.id}>{w.couple_display}</option>)}
            </select>
            <PresentForm key={weddingId} vendorKind={vendorKind} weddingId={weddingId} events={wedding?.events ?? []} onDone={done}
              doPresent={(evs, est, note) => presentVendor(vendorId, weddingId, evs, est, note)} />
          </div>
        </div>
      ) : null}
      {toast ? <div className="fixed bottom-16 left-1/2 z-[95] w-max max-w-[92vw] -translate-x-1/2 rounded-full bg-ink px-6 py-3 text-center text-[12.5px] text-bone shadow-hero">{toast}</div> : null}
    </>
  );
}
