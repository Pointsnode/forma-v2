"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Monogram, cx } from "@/components/ui";
import { createInvite, revokeInvite } from "@/app/[locale]/(app)/wedding/[id]/loop-actions";
import type { MemberVM, InviteVM } from "@/lib/loop-view";

type Role = "partner" | "family" | "day_of";

export function MembersInvites({
  weddingId, members, invites,
}: { weddingId: string; members: MemberVM[]; invites: InviteVM[] }) {
  const t = useTranslations("invites");
  const locale = useLocale();
  const [role, setRole] = useState<Role>("partner");
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const linkFor = (token: string) =>
    `${window.location.origin}${locale === "es" ? "/es" : ""}/join/${token}`;
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", { month: "short", day: "numeric" }).format(new Date(iso));
  const roleLabel = (r: string) => t(r === "partner" ? "rolePartner" : r === "family" ? "roleFamily" : "roleDayOf");

  async function copy(token: string) {
    try { await navigator.clipboard.writeText(linkFor(token)); setCopied(token); setTimeout(() => setCopied(null), 1500); } catch { /* noop */ }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-display text-[18px] text-ink">{t("members")}</h3>
        <p className="font-accent text-[14.5px] text-muted">{t("membersHint")}</p>
      </div>

      {members.length ? (
        <div className="flex flex-wrap gap-3">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <Monogram initials={m.initials} size={30} />
              <div className="leading-tight">
                <div className="text-[13.5px] text-ink">{m.name}</div>
                <div className="text-[11.5px] text-muted">{roleLabel(m.role)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="font-accent text-[14.5px] text-muted">{t("none")}</p>
      )}

      {invites.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{t("pending")}</p>
          {invites.map((i) => (
            <div key={i.id} className="flex items-center gap-2 rounded-[var(--radius)] bg-bone px-3 py-2">
              <span className="text-[13px] text-ink">{roleLabel(i.role)}</span>
              <span className="font-accent text-[12.5px] text-muted">{t("expires", { date: fmtDate(i.expiresAt) })}</span>
              <button onClick={() => copy(i.token)} className={cx("ml-auto rounded-[var(--radius)] px-3 py-1 text-[12.5px]", copied === i.token ? "bg-bone text-teal" : "bg-ink text-bone")}>
                {copied === i.token ? t("copied") : t("copy")}
              </button>
              <button onClick={() => start(async () => { await revokeInvite(weddingId, i.id); })} disabled={pending} className="rounded-[var(--radius)] px-2 py-1 text-[12.5px] text-muted hover:text-wine">
                {t("revoke")}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-[var(--radius)] bg-bone px-3 py-2 text-[13.5px] text-ink outline-none">
          <option value="partner">{t("rolePartner")}</option>
          <option value="family">{t("roleFamily")}</option>
          <option value="day_of">{t("roleDayOf")}</option>
        </select>
        <Button onClick={() => start(async () => { await createInvite(weddingId, role); })} disabled={pending}>{t("invite")}</Button>
      </div>
    </div>
  );
}
