"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Card, Heading, Badge, Button, cx, type BadgeTone } from "@/components/ui";
import { formaErrorMessage } from "@/lib/forma-error";
import {
  requestQuote, recordQuote, sendQuote, acceptQuote, declineQuote, bookEngagement,
  archiveEngagement, withdrawProposal, addToBudget, coupleRespond, type LedgerResult,
} from "@/app/[locale]/(app)/wedding/[id]/vendors/ledger-actions";

type TimelineVM =
  | { kind: "opened"; dateFmt: string; presenter: string | null; estimateFmt: string | null; note: string | null; events: string[] }
  | { kind: "quote"; dateFmt: string; ordinal: number; status: string; amountFmt: string | null; validUntil: string | null; note: string | null; url: string | null }
  | { kind: "proposal"; dateFmt: string; status: string; title: string; respondedFmt: string | null }
  | { kind: "message"; dateFmt: string; authorName: string; isCouple: boolean; body: string };

export type LedgerVM = {
  id: string; weddingId: string; vendorName: string; vendorKind: string; status: string;
  priceStrip: { label: string; amountFmt: string; deltaFmt: string | null; deltaUp: boolean; dateFmt: string }[];
  timeline: TimelineVM[];
  rail: {
    vendorId: string;
    latestQuoteId: string | null; latestQuoteStatus: string | null; latestSent: boolean;
    acceptedQuoteId: string | null; acceptedAmountFmt: string | null;
    openQuoteProposalId: string | null; presentationProposalId: string | null; hasBudgetLine: boolean;
  };
};

const ENG_TONE: Record<string, BadgeTone> = { presented: "sand", shortlisted: "sand", quote_requested: "wine", quoted: "sage", booked: "ink", declined: "maroon", archived: "sand" };
const QUOTE_TONE: Record<string, BadgeTone> = { requested: "wine", received: "sage", accepted: "ink", declined: "maroon", expired: "sand" };

const kindKey = (k: string) => `kind${k.charAt(0).toUpperCase()}${k.slice(1)}`;

export function EngagementLedgerView({ vm, isStaff }: { vm: LedgerVM; isStaff: boolean }) {
  const t = useTranslations("engagement");
  const tv = useTranslations("vendors");
  const te = useTranslations("errors");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run(fn: () => Promise<LedgerResult>, after?: () => void) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (r.ok) { after?.(); router.refresh(); }
      else setErr(formaErrorMessage(r, te));
    });
  }

  return (
    <div className="space-y-5">
      {/* Header + price strip */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <Heading className="text-[22px]">{vm.vendorName}</Heading>
              <Badge tone={ENG_TONE[vm.status] ?? "sand"}>{t(`engStatus_${vm.status}`)}</Badge>
            </div>
            <p className="mt-0.5 font-accent text-[15px] italic text-taupe">{tv(kindKey(vm.vendorKind))}</p>
          </div>
        </div>
        {vm.priceStrip.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-muted">{t("priceStripCaption")}</p>
            <div className="flex flex-wrap items-stretch gap-2">
              {vm.priceStrip.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  {i > 0 ? <span aria-hidden className="text-muted">→</span> : null}
                  <div className={cx("rounded-[var(--radius)] px-3 py-2", s.label === "final" ? "bg-ink text-bone" : "bg-bone")}>
                    <div className="text-[10.5px] uppercase tracking-[0.12em] opacity-70">{s.label.startsWith("quote") ? t("quoteN", { n: s.label.replace("quote", "") }) : t(`price_${s.label}`)}</div>
                    <div className="font-display text-[17px] leading-tight">{s.amountFmt}</div>
                    {s.deltaFmt ? <div className={cx("text-[11px]", s.label === "final" ? "text-bone/70" : s.deltaUp ? "text-wine" : "text-teal")}>{s.deltaFmt}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* The interleaved timeline */}
      <Card>
        <Heading className="text-[17px]">{t("ledgerTitle")}</Heading>
        {vm.timeline.length <= 1 && vm.rail.latestQuoteId == null ? (
          <p className="py-4 text-center font-accent text-[15px] italic text-muted">{t("emptyLedger")}</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {vm.timeline.map((it, i) => <li key={i}><TimelineRow it={it} t={t} /></li>)}
          </ol>
        )}
      </Card>

      {err ? <p className="text-[13px] text-wine">{err}</p> : null}

      {/* Actions rail */}
      {isStaff ? <StaffRail vm={vm} t={t} te={te} run={run} pending={pending} setErr={setErr} router={router} /> : <CoupleRail vm={vm} t={t} run={run} pending={pending} />}
    </div>
  );
}

function TimelineRow({ it, t }: { it: TimelineVM; t: (k: string, v?: Record<string, string | number>) => string }) {
  if (it.kind === "opened") {
    return (
      <div className="flex gap-3">
        <Dot tone="sand" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] text-ink"><span className="font-medium">{t("openedTitle")}</span>{it.presenter ? ` · ${it.presenter}` : ""} <span className="text-muted">· {it.dateFmt}</span></p>
          {it.estimateFmt ? <p className="text-[12.5px] text-muted">{t("estimate")}: {it.estimateFmt}</p> : null}
          {it.events.length ? <p className="text-[12.5px] text-muted">{it.events.join(" · ")}</p> : null}
          {it.note ? <p className="mt-1 font-accent text-[15px] italic text-taupe">{it.note}</p> : null}
        </div>
      </div>
    );
  }
  if (it.kind === "quote") {
    return (
      <div className="flex gap-3">
        <Dot tone={QUOTE_TONE[it.status] ?? "sand"} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[14px] text-ink">
            <span className="font-medium">{t("quoteN", { n: it.ordinal })}</span>
            {it.amountFmt ? <span className="font-display">{it.amountFmt}</span> : null}
            <Badge tone={QUOTE_TONE[it.status] ?? "sand"}>{t(`quoteStatus_${it.status}`)}</Badge>
            <span className="text-muted">· {it.dateFmt}</span>
          </p>
          {it.validUntil ? <p className="text-[12.5px] text-muted">{t("validUntilOn", { date: it.validUntil })}</p> : null}
          {it.note ? <p className="text-[12.5px] text-taupe">{it.note}</p> : null}
          {it.url ? <a href={it.url} target="_blank" rel="noreferrer" className="text-[12.5px] font-medium text-ink underline-offset-2 hover:underline">{t("openPdf")} ↓</a> : null}
        </div>
      </div>
    );
  }
  if (it.kind === "proposal") {
    return (
      <div className="flex gap-3">
        <Dot tone="ink" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] text-ink"><span className="font-medium">{it.title}</span> <Badge tone="sand">{t(`propStatus_${it.status}`)}</Badge> <span className="text-muted">· {it.dateFmt}</span></p>
          {it.respondedFmt ? <p className="text-[12px] text-muted">{t("answered", { date: it.respondedFmt })}</p> : null}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <span className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius)] text-[10px] font-semibold", it.isCouple ? "bg-wine text-bone" : "bg-champagne text-ink")}>{it.authorName.slice(0, 1).toUpperCase()}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] text-muted">{it.authorName} · {it.dateFmt}</p>
        <p className="rounded-[var(--radius)] bg-bone px-3 py-2 text-[14px] text-ink">{it.body}</p>
      </div>
    </div>
  );
}

function RailBtn({ label, onClick, disabled, variant = "ghost" }: { label: string; onClick: () => void; disabled?: boolean; variant?: "solid" | "ghost" }) {
  return <Button variant={variant} onClick={onClick} disabled={disabled}>{label}</Button>;
}

function Dot({ tone }: { tone: BadgeTone }) {
  const bg: Record<BadgeTone, string> = { sand: "bg-champagne", wine: "bg-wine", sage: "bg-teal", maroon: "bg-oxblood", ink: "bg-ink" };
  return <span className={cx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[var(--radius)]", bg[tone])} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StaffRail({ vm, t, run, pending, router }: { vm: LedgerVM; t: any; te: any; run: (fn: () => Promise<LedgerResult>, after?: () => void) => void; pending: boolean; setErr: (s: string | null) => void; router: ReturnType<typeof useRouter> }) {
  const s = vm.status;
  const r = vm.rail;
  const [showRecord, setShowRecord] = useState(false);

  return (
    <Card>
      <Heading className="text-[17px]">{t("actionsTitle")}</Heading>
      <div className="mt-3 flex flex-wrap gap-2">
        {(s === "presented" || s === "shortlisted") && <RailBtn variant="solid" label={t("requestQuote")} disabled={pending} onClick={() => run(() => requestQuote(vm.id))} />}
        {s === "presented" && r.presentationProposalId && <RailBtn label={t("withdraw")} disabled={pending} onClick={() => run(() => withdrawProposal(r.presentationProposalId!))} />}

        {s === "quote_requested" && r.latestQuoteId && <RailBtn variant="solid" label={showRecord ? t("cancel") : t("recordQuote")} disabled={pending} onClick={() => setShowRecord((v) => !v)} />}

        {s === "quoted" && r.latestQuoteId && (
          <>
            {!r.latestSent && <RailBtn variant="solid" label={t("sendQuote")} disabled={pending} onClick={() => run(() => sendQuote(r.latestQuoteId!, ""))} />}
            {r.latestSent && <span className="self-center text-[12.5px] text-teal">{t("sentToCouple")}</span>}
            <RailBtn label={t("recordRevised")} disabled={pending} onClick={() => run(() => requestQuote(vm.id))} />
            <RailBtn label={t("accept")} disabled={pending} onClick={() => run(() => acceptQuote(r.latestQuoteId!))} />
            <RailBtn label={t("decline")} disabled={pending} onClick={() => run(() => declineQuote(r.latestQuoteId!))} />
            <RailBtn label={t("book")} disabled={pending} onClick={() => run(() => bookEngagement(vm.id))} />
          </>
        )}

        {s === "booked" && (
          <>
            {!r.hasBudgetLine && r.acceptedQuoteId && <RailBtn variant="solid" label={t("addToBudget", { amount: r.acceptedAmountFmt ?? "" })} disabled={pending} onClick={() => run(() => addToBudget(r.acceptedQuoteId!))} />}
            <Link href={`/wedding/${vm.weddingId}/documents`} className="inline-flex items-center rounded-[var(--radius)] px-5 py-2.5 text-[14px] text-ink hover:text-taupe">{t("addDocument")}</Link>
          </>
        )}

        {(s === "declined" || s === "archived") && (
          <Link href={`/wedding/${vm.weddingId}/vendors?present=${r.vendorId}`} className="inline-flex items-center rounded-[var(--radius)] bg-ink px-5 py-2.5 text-[14px] font-medium text-bone hover:opacity-90">{t("rePresent")}</Link>
        )}

        {s !== "booked" && s !== "declined" && s !== "archived" && <RailBtn label={t("archive")} disabled={pending} onClick={() => run(() => archiveEngagement(vm.id))} />}
      </div>

      {showRecord && r.latestQuoteId && (
        <RecordQuoteForm quoteId={r.latestQuoteId} weddingId={vm.weddingId} t={t} pending={pending} onDone={() => { setShowRecord(false); router.refresh(); }} run={run} />
      )}
    </Card>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RecordQuoteForm({ quoteId, weddingId, t, pending, onDone }: { quoteId: string; weddingId: string; t: any; pending: boolean; onDone: () => void; run: (fn: () => Promise<LedgerResult>, after?: () => void) => void }) {
  const [amount, setAmount] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [note, setNote] = useState("");
  const [busy, startForm] = useTransition();
  const [ferr, setFerr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const F = "w-full rounded-[var(--radius)] bg-bone px-3.5 py-2.5 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-champagne";

  function submit() {
    setFerr(null);
    const fd = new FormData();
    const f = fileRef.current?.files?.[0];
    if (f) fd.append("file", f);
    startForm(async () => {
      const res = await recordQuote(quoteId, weddingId, amount, validUntil, note, fd);
      if (res.ok) onDone();
      else setFerr(res.error === "notpdf" ? t("notPdf") : res.error === "toobig" ? t("tooBig") : res.message || t("recordFailed"));
    });
  }

  return (
    <div className="mt-4 grid gap-3 rounded-[var(--radius)] bg-bone/60 p-4 sm:max-w-md">
      <input className={F} inputMode="decimal" placeholder={t("amountPlaceholder")} value={amount} onChange={(e) => setAmount(e.target.value)} />
      <label className="text-[12px] text-muted">{t("validUntilLabel")}<input className={cx(F, "mt-1")} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label>
      <input ref={fileRef} type="file" accept="application/pdf" className="text-[12.5px] text-ink file:mr-3 file:rounded-[var(--radius)] file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-bone" />
      <p className="-mt-1.5 text-[11.5px] text-muted">{t("pdfHint")}</p>
      <textarea className={cx(F, "min-h-[64px] resize-y")} placeholder={t("notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
      {ferr ? <p className="text-[13px] text-wine">{ferr}</p> : null}
      <Button variant="solid" onClick={submit} disabled={busy || pending || !amount}>{busy ? t("saving") : t("saveQuote")}</Button>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CoupleRail({ vm, t, run, pending }: { vm: LedgerVM; t: any; run: (fn: () => Promise<LedgerResult>, after?: () => void) => void; pending: boolean }): ReactNode {
  const pid = vm.rail.openQuoteProposalId;
  const [asking, setAsking] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [msg, setMsg] = useState("");
  if (!pid) return null;

  return (
    <Card>
      <p className="mb-3 font-accent text-[15px] italic text-taupe">{t("coupleHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="solid" onClick={() => { setDeclining(false); run(() => coupleRespond(pid, "approve", null)); }} disabled={pending}>{t("coupleAccept")}</Button>
        <Button onClick={() => { setDeclining(false); setAsking((v) => !v); }} disabled={pending}>{t("coupleAskNew")}</Button>
        {/* Two-step confirm in the label — no native confirm() (unclickable by automation). */}
        <button
          onClick={() => (declining ? run(() => coupleRespond(pid, "decline", null), () => setDeclining(false)) : setDeclining(true))}
          onBlur={() => setDeclining(false)}
          disabled={pending}
          className={cx("rounded-[var(--radius)] px-4 py-2 text-[13px] disabled:opacity-50", declining ? "font-medium text-wine" : "text-muted hover:text-wine")}
        >
          {declining ? t("reallyDecline") : t("coupleDecline")}
        </button>
      </div>
      {asking && (
        <div className="mt-3 grid gap-2 sm:max-w-md">
          <textarea className="min-h-[72px] w-full resize-y rounded-[var(--radius)] bg-bone px-3.5 py-2.5 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-champagne" placeholder={t("askPlaceholder")} value={msg} onChange={(e) => setMsg(e.target.value)} />
          <Button variant="solid" onClick={() => run(() => coupleRespond(pid, "request_change", msg), () => { setAsking(false); setMsg(""); })} disabled={pending || !msg.trim()}>{t("sendAsk")}</Button>
        </div>
      )}
    </Card>
  );
}
