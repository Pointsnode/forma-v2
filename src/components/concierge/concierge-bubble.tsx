"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";
import { DomainStar } from "@/components/ui";

type DraftCard = { kind: string; id: string; title: string };
type ActionCard = { messageId: string; fn: string; summary: string; heading?: string; status: "pending" | "approved" | "dismissed" | "failed"; error?: string };
type Msg = { role: "planner" | "concierge"; content: string; draft?: DraftCard | null; action?: ActionCard | null; createdAt?: string };
type ThreadSummary = { id: string; title: string; updated_at: string };
type Convo = { threadId: string | null; messages: Msg[]; threads: ThreadSummary[]; loaded: boolean };

export type ConciergeBubbleProps = { weddings: { id: string; name: string }[]; usage: { used: number; cap: number }; initialPending?: number };

// bone-alpha hairlines from the desk reference: panel/header/foot .16, tile .22, badge .35.
const HAIR = "border-[rgba(245,242,235,0.16)]";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(n);
}
function scopeFromPath(path: string): { weddingId: string | null; key: string } {
  const m = path.match(/^\/wedding\/([0-9a-fA-F-]+)/);
  return m ? { weddingId: m[1], key: `w:${m[1]}` } : { weddingId: null, key: "studio" };
}
function draftHref(kind: string, id: string, weddingId: string | null): string {
  if (!weddingId) return "/tasks";
  switch (kind) {
    case "contract": return `/wedding/${weddingId}/contracts/${id}`;
    case "proposal": return `/wedding/${weddingId}/proposals`;
    case "ledger": return `/wedding/${weddingId}/budget`;
    default: return `/wedding/${weddingId}`;
  }
}
const EMPTY: Convo = { threadId: null, messages: [], threads: [], loaded: false };
const toMsg = (m: { id: string; role: string; content: string; draft_ref: unknown; action_ref: unknown; created_at?: string }): Msg => ({
  role: m.role === "concierge" ? "concierge" : "planner",
  content: m.content,
  draft: (m.draft_ref as DraftCard) ?? null,
  action: m.action_ref ? { messageId: m.id, ...(m.action_ref as Omit<ActionCard, "messageId">) } : null,
  createdAt: m.created_at,
});

function intl(locale: string) { return locale === "es" ? "es" : "en"; }
function timeStamp(iso: string | undefined, locale: string): string {
  if (!iso) return "";
  try { return new Intl.DateTimeFormat(intl(locale), { hour: "numeric", minute: "2-digit" }).format(new Date(iso)); } catch { return ""; }
}
function relDate(iso: string, locale: string, today: string, yesterday: string): string {
  const d = new Date(iso), now = new Date();
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((midnight(now) - midnight(d)) / 86_400_000);
  if (diff <= 0) return today;
  if (diff === 1) return yesterday;
  try { return new Intl.DateTimeFormat(intl(locale), { month: "short", day: "numeric" }).format(d); } catch { return ""; }
}

export function ConciergeBubble({ weddings, usage: usage0, initialPending = 0 }: ConciergeBubbleProps) {
  const t = useTranslations("concierge");
  const locale = useLocale();
  const path = usePathname();
  const { weddingId, key: scopeKey } = scopeFromPath(path);
  const scopeName = weddingId ? weddings.find((w) => w.id === weddingId)?.name ?? null : null;

  const [open, setOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [convos, setConvos] = useState<Record<string, Convo>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState(usage0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const convo = convos[scopeKey] ?? EMPTY;
  const anyLoaded = Object.values(convos).some((c) => c.loaded || c.messages.length > 0);
  const livePending = Object.values(convos).reduce((n, c) => n + c.messages.filter((m) => m.action?.status === "pending").length, 0);
  const pendingTotal = anyLoaded ? livePending : initialPending;

  const setConvo = useCallback((updater: (c: Convo) => Convo) => {
    setConvos((prev) => ({ ...prev, [scopeKey]: updater(prev[scopeKey] ?? EMPTY) }));
  }, [scopeKey]);

  const loadHistory = useCallback(async (threadId?: string) => {
    const qs = new URLSearchParams();
    if (weddingId) qs.set("weddingId", weddingId);
    if (threadId) qs.set("threadId", threadId);
    try {
      const res = await fetch(`/api/concierge?${qs.toString()}`);
      const data = (await res.json()) as { threads: ThreadSummary[]; threadId: string | null; messages: Parameters<typeof toMsg>[0][] };
      setConvo((c) => ({ ...c, threadId: data.threadId, threads: data.threads, messages: data.messages.map(toMsg), loaded: true }));
    } catch {
      setConvo((c) => ({ ...c, loaded: true }));
    }
  }, [weddingId, setConvo]);

  useEffect(() => {
    if (!open || convo.loaded) return;
    let cancelled = false;
    (async () => {
      const qs = new URLSearchParams();
      if (weddingId) qs.set("weddingId", weddingId);
      try {
        const res = await fetch(`/api/concierge?${qs.toString()}`);
        const data = (await res.json()) as { threads: ThreadSummary[]; threadId: string | null; messages: Parameters<typeof toMsg>[0][] };
        if (!cancelled) setConvo((c) => ({ ...c, threadId: data.threadId, threads: data.threads, messages: data.messages.map(toMsg), loaded: true }));
      } catch {
        if (!cancelled) setConvo((c) => ({ ...c, loaded: true }));
      }
    })();
    return () => { cancelled = true; };
  }, [open, convo.loaded, weddingId, setConvo]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [convo.messages, open]);

  function startNew() { setConvo((c) => ({ ...c, threadId: null, messages: [] })); setLedgerOpen(false); }
  function selectThread(id: string) { loadHistory(id); setLedgerOpen(false); }

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setConvo((c) => ({ ...c, messages: [...c.messages, { role: "planner", content: message, createdAt: new Date().toISOString() }, { role: "concierge", content: "" }] }));
    try {
      const res = await fetch("/api/concierge", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: convo.threadId, scope: { weddingId }, message, locale }),
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.trim()) continue;
          const ev = JSON.parse(l) as Record<string, unknown>;
          if (ev.type === "thread") setConvo((c) => ({ ...c, threadId: ev.threadId as string }));
          else if (ev.type === "token") setConvo((c) => appendToken(c, ev.text as string));
          else if (ev.type === "draft") setConvo((c) => pushCard(c, { draft: { kind: ev.kind as string, id: ev.id as string, title: ev.title as string } }));
          else if (ev.type === "action") setConvo((c) => pushCard(c, { action: { messageId: ev.messageId as string, fn: ev.fn as string, summary: ev.summary as string, heading: ev.heading as string | undefined, status: "pending" } }));
          else if (ev.type === "done") { if (typeof ev.used === "number") setUsage((u) => ({ ...u, used: ev.used as number })); }
          else if (ev.type === "error") setConvo((c) => appendToken(c, `\n[${t("error")}]`));
        }
      }
    } catch {
      setConvo((c) => appendToken(c, `\n[${t("error")}]`));
    } finally { setBusy(false); }
  }

  async function decide(messageId: string, decision: "approve" | "dismiss") {
    setConvo((c) => setAction(c, messageId, (a) => ({ ...a, status: decision === "approve" ? a.status : "dismissed" })));
    try {
      const res = await fetch("/api/concierge/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId, decision }) });
      const data = (await res.json()) as { status: ActionCard["status"]; error?: string };
      setConvo((c) => setAction(c, messageId, (a) => ({ ...a, status: data.status, error: data.error })));
    } catch {
      setConvo((c) => setAction(c, messageId, (a) => ({ ...a, status: "failed", error: t("error") })));
    }
  }

  const capPct = usage.cap > 0 ? Math.min(100, Math.round((usage.used / usage.cap) * 100)) : 0;
  const iconbtn = `flex items-center gap-1.5 text-[11px] tracking-[0.08em] text-[rgba(245,242,235,0.55)] transition-colors hover:text-bone`;

  return (
    <div className="fixed bottom-[26px] right-[26px] z-[60] flex flex-col items-end gap-4 print:hidden">
      {open ? (
        <section className={`flex h-[600px] max-h-[74vh] w-[390px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-[var(--radius)] bg-ink border ${HAIR}`}>
          {/* Header: champagne star + THE CONCIERGE kicker + ledger toggle + new */}
          <header className={`flex items-center gap-2.5 border-b ${HAIR} px-4 py-[15px]`}>
            <DomainStar fill="#D7C3A5" size={15} />
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-champagne">{t("kicker")}</span>
            <div className="ml-auto flex items-center gap-3.5">
              <button onClick={() => setLedgerOpen((v) => !v)} className={iconbtn} aria-expanded={ledgerOpen}>
                <svg width="13" height="13" viewBox="0 0 13 13" stroke="currentColor" strokeWidth="1.2" fill="none" aria-hidden><path d="M2 3.5h9M2 6.5h9M2 9.5h9" strokeLinecap="round" /></svg>
                {t("ledger")}
              </button>
              <button onClick={startNew} className={iconbtn}>+ {t("newThread")}</button>
              <button onClick={() => setOpen(false)} aria-label={t("collapse")} className="text-[13px] text-[rgba(245,242,235,0.55)] transition-colors hover:text-bone">✕</button>
            </div>
          </header>

          {/* The ledger of conversations */}
          {ledgerOpen ? (
            <div className={`border-b ${HAIR} bg-[rgba(245,242,235,0.03)] py-1.5`}>
              {convo.threads.length === 0 ? (
                <p className="px-4 py-2 text-[12px] text-[rgba(245,242,235,0.4)]">{scopeName ? t("emptyWedding", { name: scopeName }) : t("emptyStudio")}</p>
              ) : convo.threads.map((th) => {
                const cur = th.id === convo.threadId;
                return (
                  <button key={th.id} onClick={() => selectThread(th.id)}
                    className={`flex w-full items-baseline justify-between gap-2.5 px-4 py-[9px] text-left text-[12.5px] transition-colors hover:bg-[rgba(245,242,235,0.05)] hover:text-bone ${cur ? "text-bone" : "text-[rgba(245,242,235,0.8)]"}`}>
                    <span className="min-w-0 flex-1 truncate">
                      {cur ? <span className="mr-2 inline-block h-[5px] w-[5px] translate-y-[-1px] rounded-[1px] bg-champagne align-middle" /> : null}
                      {th.title || t("newThread")}
                    </span>
                    <span className="shrink-0 text-[10.5px] tracking-[0.06em] text-[rgba(245,242,235,0.4)]">{relDate(th.updated_at, locale, t("today"), t("yesterday"))}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Messages */}
          <div ref={scrollRef} className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-4">
            {convo.messages.length === 0 ? (
              <p className="mt-8 text-center font-accent text-[14px] italic text-[rgba(245,242,235,0.45)]">{scopeName ? t("emptyWedding", { name: scopeName }) : t("emptyStudio")}</p>
            ) : convo.messages.map((m, i) => {
              const isLast = i === convo.messages.length - 1;
              if (m.role === "planner") {
                return (
                  <div key={i} className="max-w-[85%] self-end rounded-[var(--radius)] bg-bone px-[13px] py-2.5 text-[13px] leading-[1.55] text-ink">{m.content}</div>
                );
              }
              const thinking = busy && isLast && !m.content && !m.draft && !m.action;
              return (
                <div key={i} className="flex max-w-[92%] flex-col gap-1.5">
                  {thinking ? (
                    <div className="flex items-center gap-2.5 text-[12px] text-[rgba(245,242,235,0.5)]">
                      <span className="concierge-breathe inline-flex"><DomainStar fill="#D7C3A5" size={13} /></span>
                      <span>{t("thinking")}</span>
                    </div>
                  ) : null}
                  {m.content ? <div className="text-[13px] leading-[1.62] text-bone">{m.content}</div> : null}
                  {m.draft ? (
                    <Link href={draftHref(m.draft.kind, m.draft.id, weddingId)}
                      className={`flex items-center gap-2 rounded-[var(--radius)] border ${HAIR} bg-[rgba(245,242,235,0.04)] px-3 py-2`}>
                      <span className="text-[10px] uppercase tracking-[0.08em] text-[rgba(245,242,235,0.5)]">{t(`draftKind_${m.draft.kind}`)}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-bone">{m.draft.title}</span>
                      <span className="shrink-0 text-[12px] text-champagne">{t("openDraft")} →</span>
                    </Link>
                  ) : null}
                  {m.action ? <ActionCardView card={m.action} t={t} onDecide={decide} /> : null}
                  {m.content && !thinking ? (
                    <div className="flex items-center gap-2.5">
                      <CopyButton text={m.content} t={t} />
                      {m.createdAt ? <span className="text-[10px] tracking-[0.08em] text-[rgba(245,242,235,0.3)]">{timeStamp(m.createdAt, locale)}</span> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Input row: transparent input + wine ASK */}
          <div className={`border-t ${HAIR}`}>
            <div className="flex items-center">
              <textarea value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1} placeholder={scopeName ? t("askWedding") : t("askStudio")} disabled={busy}
                className="max-h-24 flex-1 resize-none bg-transparent px-4 py-3.5 text-[13px] font-light text-bone outline-none placeholder:text-[rgba(245,242,235,0.35)]" />
              <button onClick={send} disabled={busy || !input.trim()} aria-label={t("ask")} className="m-2 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[var(--radius)] bg-wine text-bone transition-opacity disabled:opacity-40">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" /></svg>
              </button>
            </div>
            <p className="px-4 pb-2 text-[10px] tracking-[0.06em] text-[rgba(245,242,235,0.3)]">{t("meter", { used: fmtTokens(usage.used), cap: fmtTokens(usage.cap) })}{usage.cap > 0 ? ` · ${capPct}%` : ""}</p>
          </div>
        </section>
      ) : null}

      {/* The floater (option 03): 54px oxblood tile, bare bone star, oxblood badge. */}
      <button onClick={() => setOpen((o) => !o)} aria-label={t("kicker")}
        className="relative flex h-[54px] w-[54px] items-center justify-center rounded-[var(--radius)] bg-oxblood border border-[rgba(245,242,235,0.22)] transition-transform hover:scale-[1.03]">
        <DomainStar fill="#F5F2EB" size={22} />
        {!open && pendingTotal > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-[var(--radius)] bg-oxblood px-1 text-[10px] font-medium text-bone border border-[rgba(245,242,235,0.35)]">{pendingTotal}</span>
        ) : null}
      </button>
    </div>
  );
}

function CopyButton({ text, t }: { text: string; t: ReturnType<typeof useTranslations> }) {
  const [done, setDone] = useState(false);
  return (
    <button
      aria-label={done ? t("copied") : t("copyAria")} title={done ? t("copied") : t("copyAria")}
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } }}
      className={`inline-flex p-0.5 transition-colors ${done ? "text-champagne" : "text-[rgba(245,242,235,0.38)] hover:text-champagne"}`}>
      <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
        <rect x="4.5" y="4.5" width="9" height="9" rx="1" />
        <path d="M10.5 4.5V3.2a1 1 0 0 0-1-1H2.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// Draft/action cards, restyled to the charcoal desk. Status still reads through the row,
// never a tinted card ground: pending hairline, approved teal edge, failed wine edge.
function ActionCardView({ card, t, onDecide }: { card: ActionCard; t: ReturnType<typeof useTranslations>; onDecide: (id: string, d: "approve" | "dismiss") => void }) {
  const edge = card.status === "approved" ? "border-teal" : card.status === "failed" ? "border-wine" : "border-[rgba(245,242,235,0.16)]";
  return (
    <div className={`rounded-[var(--radius)] border ${edge} bg-[rgba(245,242,235,0.04)] px-3 py-2`}>
      {card.heading ? <p className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-champagne">{card.heading}</p> : null}
      <p className="text-[12.5px] text-bone">{card.summary}</p>
      {card.status === "pending" ? (
        <div className="mt-2 flex gap-2">
          <button onClick={() => onDecide(card.messageId, "approve")} className="rounded-[var(--radius)] bg-wine px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-bone">{t("approve")}</button>
          <button onClick={() => onDecide(card.messageId, "dismiss")} className="rounded-[var(--radius)] px-2.5 py-1 text-[12px] text-[rgba(245,242,235,0.55)] transition-colors hover:text-bone">{t("dismiss")}</button>
        </div>
      ) : (
        <p className={`mt-1 text-[11.5px] ${card.status === "approved" ? "text-teal" : card.status === "failed" ? "text-wine" : "text-[rgba(245,242,235,0.5)]"}`}>
          {card.status === "approved" ? t("statusApproved") : card.status === "dismissed" ? t("statusDismissed") : card.error || t("actionFailed")}
        </p>
      )}
    </div>
  );
}

function appendToken(c: Convo, text: string): Convo {
  const msgs = c.messages.slice();
  const last = msgs[msgs.length - 1];
  if (last && last.role === "concierge") msgs[msgs.length - 1] = { ...last, content: last.content + text };
  else msgs.push({ role: "concierge", content: text });
  return { ...c, messages: msgs };
}
function pushCard(c: Convo, card: { draft?: DraftCard; action?: ActionCard }): Convo {
  return { ...c, messages: [...c.messages, { role: "concierge", content: "", ...card }] };
}
function setAction(c: Convo, messageId: string, fn: (a: ActionCard) => ActionCard): Convo {
  return { ...c, messages: c.messages.map((m) => (m.action?.messageId === messageId ? { ...m, action: fn(m.action) } : m)) };
}
