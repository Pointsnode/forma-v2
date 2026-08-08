"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

// MSG-2 — the couple side of the client lane. One shared thread with the planner: the couple reads
// and writes through the member-gated DEFINERs (board_client_thread / board_post_client), never a
// table policy. No tasks, no @mentions, no concierge. Realtime is a change-signal → re-fetch through
// RLS, so the team lane never appears here.
export type CMsg = {
  id: string; author_kind: string; author_name: string | null; body: string | null;
  deleted_at: string | null; edited_at: string | null; created_at: string; mine: boolean;
};

export function CoupleMessages({ weddingId, initial }: { weddingId: string; initial: CMsg[] }) {
  const t = useTranslations("couple");
  const supabase = createClient();
  const [messages, setMessages] = useState<CMsg[]>(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("board_client_thread", { p_wedding: weddingId });
    setMessages((data as CMsg[]) ?? []);
    setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [supabase, weddingId]);

  useEffect(() => {
    const ch = supabase.channel(`client:${weddingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "board_messages", filter: `wedding_id=eq.${weddingId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, weddingId, load]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    await supabase.rpc("board_post_client", { p_wedding: weddingId, p_body: body });
    await load();
    setSending(false);
  }

  return (
    <div>
      <div className="max-h-[360px] overflow-y-auto">
        {messages.length === 0 ? (
          <p className="font-accent text-[15px] italic text-text-meta">{t("messagesEmpty")}</p>
        ) : messages.map((m) => (
          <div key={m.id} className="border-b border-hairline-token py-2 last:border-b-0">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] font-medium text-text-primary">{m.mine ? t("messagesYou") : m.author_name ?? t("yourPlanner")}</span>
              <span className="text-[10px] text-text-meta">{m.created_at.slice(11, 16)}</span>
            </div>
            {m.deleted_at ? (
              <p className="text-[13px] italic text-text-meta">{t("messagesDeleted")}</p>
            ) : (
              <p className="whitespace-pre-wrap text-[13.5px] text-text-primary">{m.body}{m.edited_at ? <span className="ml-1.5 text-[10px] text-text-meta">({t("messagesEdited")})</span> : null}</p>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <div className="mt-3 flex items-end gap-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} rows={2}
          placeholder={t("messagesPlaceholder")} className="flex-1 resize-none rounded-[var(--radius)] border border-hairline-token bg-surface-card px-3 py-2 text-[13px] text-text-primary outline-none" />
        <button onClick={send} disabled={!text.trim() || sending} className="rounded-[var(--radius)] bg-wine px-3 py-2 text-[12px] font-medium text-bone disabled:opacity-40">{t("messagesSend")}</button>
      </div>
    </div>
  );
}
