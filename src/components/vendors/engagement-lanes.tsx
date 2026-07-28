"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pill, Button, cx } from "@/components/ui";
import { requestQuote, recordQuote, acceptQuote, declineQuote, bookEngagement, archiveEngagement } from "@/app/[locale]/(app)/(studio)/vendors/actions";
import { QuickAddTask } from "@/components/tasks/quick-add";

export type EngagementVM = {
  id: string; vendorName: string; vendorKind: string; status: string;
  estimate: string | null; eventLabels: string[];
  quote: { id: string; status: string; amount: string | null; validUntil: string | null; expired: boolean } | null;
};

const statusKey = (s: string) => `status${s.charAt(0).toUpperCase()}${s.slice(1)}`;
const kindKey = (k: string) => `kind${k.charAt(0).toUpperCase()}${k.slice(1)}`;
const inputCls = "rounded-lg bg-bone px-2.5 py-1.5 text-[13px] text-ink shadow-card outline-none";

function Card({ e, weddingId }: { e: EngagementVM; weddingId: string }) {
  const t = useTranslations("engagement");
  const tv = useTranslations("vendors");
  const [recording, setRecording] = useState(false);
  const [amount, setAmount] = useState("");
  const [valid, setValid] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) => { setErr(null); start(async () => { const r = await fn(); if (r?.error) setErr(t("error")); }); };

  return (
    <div className="rounded-2xl bg-paper p-4 shadow-card">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[16px] text-ink">{e.vendorName}</p>
          <p className="font-accent text-[13px] text-muted">{tv(kindKey(e.vendorKind))}{e.eventLabels.length ? ` · ${e.eventLabels.join(", ")}` : ""}{e.estimate ? ` · ${e.estimate}` : ""}</p>
          {e.quote ? <p className="mt-0.5 text-[12.5px] text-taupe">{t("latestQuote")}: {e.quote.amount ?? "—"}{e.quote.validUntil ? ` · ${e.quote.validUntil}` : ""}{e.quote.expired ? ` · ${t("validPast")}` : ""}</p> : null}
        </div>
        <Pill tone={e.status === "booked" ? "sage" : e.status === "declined" ? "wine" : "sand"}>{t(statusKey(e.status))}</Pill>
      </div>
      <div className="mt-2 flex justify-end">
        <QuickAddTask weddings={[]} workspaceId="" defaultWeddingId={weddingId} prelink={{ kind: "engagement", id: e.id, label: e.vendorName }} variant="inline" />
      </div>

      {!["declined", "archived"].includes(e.status) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {["presented", "shortlisted"].includes(e.status) ? <Button variant="ghost" disabled={pending} onClick={() => run(() => requestQuote(e.id))}>{t("requestQuote")}</Button> : null}
          {["quote_requested", "quoted"].includes(e.status) ? <Button variant="ghost" disabled={pending} onClick={() => setRecording((v) => !v)}>{t("recordQuote")}</Button> : null}
          {e.quote && e.quote.status === "received" ? <Button variant="ghost" disabled={pending} onClick={() => run(() => acceptQuote(e.quote!.id))}>{t("acceptQuote")}</Button> : null}
          {e.quote && e.quote.status === "received" ? <Button variant="ghost" disabled={pending} onClick={() => run(() => declineQuote(e.quote!.id))}>{t("declineQuote")}</Button> : null}
          {["quoted", "shortlisted"].includes(e.status) ? <Button disabled={pending} onClick={() => run(() => bookEngagement(e.id))}>{t("book")}</Button> : null}
          <Button variant="ghost" disabled={pending} onClick={() => run(() => archiveEngagement(e.id))}>{t("archive")}</Button>
        </div>
      ) : null}

      {recording ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1"><span className="text-[11px] text-muted">{t("amount")}</span><input value={amount} onChange={(ev) => setAmount(ev.target.value)} inputMode="numeric" className={inputCls} /></label>
          <label className="flex flex-col gap-1"><span className="text-[11px] text-muted">{t("validUntil")}</span><input type="date" value={valid} onChange={(ev) => setValid(ev.target.value)} className={inputCls} /></label>
          <Button disabled={pending || !amount} onClick={() => run(() => recordQuote(e.quote?.id ?? "", amount, valid, "").then((r) => { if (!r?.error) setRecording(false); return r; }))}>{t("recordQuote")}</Button>
        </div>
      ) : null}
      {err ? <p className="mt-1 text-[13px] text-wine">{err}</p> : null}
    </div>
  );
}

const LANES: { key: string; statuses: string[] }[] = [
  { key: "lanePresented", statuses: ["presented"] },
  { key: "laneShortlisted", statuses: ["shortlisted"] },
  { key: "laneQuotes", statuses: ["quote_requested", "quoted"] },
  { key: "laneBooked", statuses: ["booked"] },
];

export function EngagementLanes({ engagements, weddingId }: { engagements: EngagementVM[]; weddingId: string }) {
  const t = useTranslations("engagement");
  const [showClosed, setShowClosed] = useState(false);
  const closed = engagements.filter((e) => ["declined", "archived"].includes(e.status));
  if (engagements.length === 0) return <p className="py-4 text-center font-accent text-[16px] text-muted">{t("noEngagements")}</p>;
  return (
    <div className="flex flex-col gap-5">
      {LANES.map((lane) => {
        const items = engagements.filter((e) => lane.statuses.includes(e.status));
        return items.length ? (
          <section key={lane.key} className="flex flex-col gap-2">
            <p className={cx("text-[11px] font-medium uppercase tracking-[0.16em] text-muted")}>{t(lane.key)}</p>
            {items.map((e) => <Card key={e.id} e={e} weddingId={weddingId} />)}
          </section>
        ) : null;
      })}
      {closed.length ? (
        <div>
          <button onClick={() => setShowClosed((v) => !v)} className="text-[12.5px] text-muted hover:text-ink">{t("laneClosed")} ({closed.length})</button>
          {showClosed ? <div className="mt-2 flex flex-col gap-2">{closed.map((e) => <Card key={e.id} e={e} weddingId={weddingId} />)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
