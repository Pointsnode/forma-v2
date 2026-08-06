"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { acceptQuote } from "./actions";

// The accept control on the bone public page: a name field + the wine "Accept this quote".
// Accepting is the INTENT — it holds the date; the contract the studio sends is the binding
// step. On success the server re-renders into the accepted state.
export function QuoteAccept({ token }: { token: string }) {
  const t = useTranslations("quotes");
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    start(async () => {
      const r = await acceptQuote(token, name.trim());
      if (r.ok) { router.refresh(); return; }
      setErr(r.error === "expired" ? t("acceptExpired") : t("acceptErr"));
    });
  }

  return (
    <div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("acceptNamePlaceholder")}
        className="mb-3 w-full max-w-xs rounded-[var(--radius)] border border-[#E4DFD3] bg-[#F5F2EB] px-3 py-2 text-center text-[15px] text-[#111111] outline-none"
      />
      <div>
        <button
          onClick={submit}
          disabled={pending || !name.trim()}
          className="rounded-[var(--radius)] bg-[#6E353B] px-6 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[#F5F2EB] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t("accepting") : t("acceptButton")}
        </button>
      </div>
      {err ? <p className="mt-3 text-[13px] text-[#6E353B]">{err}</p> : null}
    </div>
  );
}
