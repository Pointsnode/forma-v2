"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { usePathname, Link } from "@/i18n/navigation";

type DraftCard = { kind: string; id: string; title: string };
type ActionCard = { messageId: string; fn: string; summary: string; status: "pending" | "approved" | "dismissed" | "failed"; error?: string };
type Msg = { role: "planner" | "concierge"; content: string; draft?: DraftCard | null; action?: ActionCard | null };
type ThreadSummary = { id: string; title: string };
type Convo = { threadId: string | null; messages: Msg[]; threads: ThreadSummary[]; loaded: boolean };

export type ConciergeBubbleProps = { weddings: { id: string; name: string }[]; usage: { used: number; cap: number } };

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
const toMsg = (m: { id: string; role: string; content: string; draft_ref: unknown; action_ref: unknown }): Msg => ({
  role: m.role === "concierge" ? "concierge" : "planner",
  content: m.content,
  draft: (m.draft_ref as DraftCard) ?? null,
  action: m.action_ref ? { messageId: m.id, ...(m.action_ref as Omit<ActionCard, "messageId">) } : null,
});

export function ConciergeBubble({ weddings, usage: usage0 }: ConciergeBubbleProps) {
  const t = useTranslations("concierge");
  const locale = useLocale();
  const path = usePathname();
  const { weddingId, key: scopeKey } = scopeFromPath(path);
  const scopeName = weddingId ? weddings.find((w) => w.id === weddingId)?.name ?? null : null;

  const [open, setOpen] = useState(false);
  const [convos, setConvos] = useState<Record<string, Convo>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState(usage0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const convo = convos[scopeKey] ?? EMPTY;
  const pendingTotal = Object.values(convos).reduce((n, c) => n + c.messages.filter((m) => m.action?.status === "pending").length, 0);

  const setConvo = useCallback((updater: (c: Convo) => Convo) => {
    setConvos((prev) => ({ ...prev, [scopeKey]: updater(prev[scopeKey] ?? EMPTY) }));
  }, [scopeKey]);

  // Finding 2: load the scope's persisted threads on first expand; open the most
  // recent with its messages so seeded/prior conversations are reachable.
  const loadHistory = useCallback(async (threadId?: string) => {
    const qs = new URLSearchParams();
    if (weddingId) qs.set("weddingId", weddingId);
    if (threadId) qs.set("threadId", threadId);
    try {
      const res = await fetch(`/api/concierge?${qs.toString()}`);
      const data = (await res.json()) as { threads: ThreadSummary[]; threadId: string | null; messages: { id: string; role: string; content: string; draft_ref: unknown; action_ref: unknown }[] };
      setConvo((c) => ({ ...c, threadId: data.threadId, threads: data.threads, messages: data.messages.map(toMsg), loaded: true }));
    } catch {
      setConvo((c) => ({ ...c, loaded: true }));
    }
  }, [weddingId, setConvo]);

  // auto-load the scope's history on first expand (or when the scope changes while
  // open). The state write happens after the await, off the synchronous effect path.
  useEffect(() => {
    if (!open || convo.loaded) return;
    let cancelled = false;
    (async () => {
      const qs = new URLSearchParams();
      if (weddingId) qs.set("weddingId", weddingId);
      try {
        const res = await fetch(`/api/concierge?${qs.toString()}`);
        const data = (await res.json()) as { threads: ThreadSummary[]; threadId: string | null; messages: { id: string; role: string; content: string; draft_ref: unknown; action_ref: unknown }[] };
        if (!cancelled) setConvo((c) => ({ ...c, threadId: data.threadId, threads: data.threads, messages: data.messages.map(toMsg), loaded: true }));
      } catch {
        if (!cancelled) setConvo((c) => ({ ...c, loaded: true }));
      }
    })();
    return () => { cancelled = true; };
  }, [open, convo.loaded, weddingId, setConvo]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [convo.messages, open]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setConvo((c) => ({ ...c, messages: [...c.messages, { role: "planner", content: message }, { role: "concierge", content: "" }] }));
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
          else if (ev.type === "action") setConvo((c) => pushCard(c, { action: { messageId: ev.messageId as string, fn: ev.fn as string, summary: ev.summary as string, status: "pending" } }));
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

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3 print:hidden">
      {open ? (
        <section className="flex h-[600px] max-h-[calc(100vh-7rem)] w-[420px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl bg-paper shadow-lift">
          <header className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <Glyph />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[15px] text-ink">{scopeName ? t("scoped", { name: scopeName }) : t("name")}</p>
              <p className="truncate text-[11.5px] text-muted">{scopeName ? t("scopedHint") : t("orchestratorHint")}</p>
            </div>
            {convo.threads.length > 0 || convo.messages.length > 0 ? (
              <button onClick={() => setConvo((c) => ({ ...c, threadId: null, messages: [] }))} className="rounded-lg px-2 py-1 text-[12px] text-muted hover:bg-bone hover:text-ink" title={t("newThread")}>{t("newThread")}</button>
            ) : null}
            <button onClick={() => setOpen(false)} aria-label={t("collapse")} className="rounded-lg px-2 py-1 text-[13px] text-muted hover:bg-bone hover:text-ink">✕</button>
          </header>

          {convo.threads.length > 1 ? (
            <div className="flex gap-1 overflow-x-auto border-b border-hairline px-3 py-1.5">
              {convo.threads.map((th) => (
                <button key={th.id} onClick={() => loadHistory(th.id)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] ${th.id === convo.threadId ? "bg-ink text-bone" : "bg-bone text-muted hover:text-ink"}`}>
                  {th.title || "—"}
                </button>
              ))}
            </div>
          ) : null}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {convo.messages.length === 0 ? (
              <p className="mt-8 text-center font-accent text-[14px] italic text-muted">{scopeName ? t("emptyWedding", { name: scopeName }) : t("emptyStudio")}</p>
            ) : convo.messages.map((m, i) => (
              <div key={i} className={m.role === "planner" ? "flex justify-end" : ""}>
                <div className={m.role === "planner"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-3.5 py-2 text-[13.5px] text-bone"
                  : "max-w-[92%] text-[13.5px] leading-[1.6] text-ink-soft"}>
                  {m.content || (busy && i === convo.messages.length - 1 ? <span className="text-muted">…</span> : null)}
                  {m.draft ? (
                    <Link href={draftHref(m.draft.kind, m.draft.id, weddingId)}
                      className="mt-2 flex items-center gap-2 rounded-xl bg-bone px-3 py-2 shadow-card hover:shadow-lift">
                      <span className="rounded bg-paper px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted">{t(`draftKind_${m.draft.kind}`)}</span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{m.draft.title}</span>
                      <span className="text-[12px] text-wine">{t("openDraft")} →</span>
                    </Link>
                  ) : null}
                  {m.action ? <ActionCardView card={m.action} t={t} onDecide={decide} /> : null}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-hairline px-3 py-2.5">
            <div className="flex items-end gap-2">
              <textarea value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1} placeholder={t("placeholder")} disabled={busy}
                className="max-h-24 flex-1 resize-none rounded-xl bg-bone px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-muted" />
              <button onClick={send} disabled={busy || !input.trim()} className="rounded-xl bg-ink px-3 py-2 text-[13px] text-bone disabled:opacity-40">{t("send")}</button>
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-muted">{t("meter", { used: fmtTokens(usage.used), cap: fmtTokens(usage.cap) })}{usage.cap > 0 ? ` · ${capPct}%` : ""}</p>
          </div>
        </section>
      ) : null}

      <button onClick={() => setOpen((o) => !o)}
        className="relative flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-bone shadow-lift transition-transform hover:scale-[1.03]" title={t("helper")}>
        <Glyph />
        <span className="text-[13px] font-medium">{t("name")}</span>
        {!open && pendingTotal > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-wine px-1 text-[11px] font-medium text-bone">{pendingTotal}</span>
        ) : null}
      </button>
    </div>
  );
}

function ActionCardView({ card, t, onDecide }: { card: ActionCard; t: ReturnType<typeof useTranslations>; onDecide: (id: string, d: "approve" | "dismiss") => void }) {
  const tone = card.status === "approved" ? "border-sage bg-sage-soft" : card.status === "failed" ? "border-wine bg-[rgba(92,43,53,0.06)]" : card.status === "dismissed" ? "border-hairline bg-bone" : "border-wine bg-[rgba(92,43,53,0.06)]";
  return (
    <div className={`mt-2 rounded-xl border px-3 py-2 ${tone}`}>
      <p className="text-[12.5px] text-ink">{card.summary}</p>
      {card.status === "pending" ? (
        <div className="mt-2 flex gap-2">
          <button onClick={() => onDecide(card.messageId, "approve")} className="rounded-lg bg-ink px-2.5 py-1 text-[12px] text-bone">{t("approve")}</button>
          <button onClick={() => onDecide(card.messageId, "dismiss")} className="rounded-lg px-2.5 py-1 text-[12px] text-muted hover:text-ink">{t("dismiss")}</button>
        </div>
      ) : (
        <p className={`mt-1 text-[11.5px] ${card.status === "approved" ? "text-sage-ink" : card.status === "failed" ? "text-wine" : "text-muted"}`}>
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
// each draft/action is its own bubble message (mirrors per-row persistence, so a
// turn with several cards never collapses them).
function pushCard(c: Convo, card: { draft?: DraftCard; action?: ActionCard }): Convo {
  return { ...c, messages: [...c.messages, { role: "concierge", content: "", ...card }] };
}
function setAction(c: Convo, messageId: string, fn: (a: ActionCard) => ActionCard): Convo {
  return { ...c, messages: c.messages.map((m) => (m.action?.messageId === messageId ? { ...m, action: fn(m.action) } : m)) };
}

function Glyph() {
  return <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgba(247,244,238,0.14)] font-display text-[13px] leading-none text-bone">c</span>;
}
