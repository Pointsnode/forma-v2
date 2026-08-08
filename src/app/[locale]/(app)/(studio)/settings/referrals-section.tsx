"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, Heading, Badge } from "@/components/ui";
import { formatCents } from "@/lib/admin/money.mjs";
import { REFERRAL_INVOICES, REFERRAL_CREDIT_DOLLARS, REFERRAL_CASH_THRESHOLD_CENTS, REFERRAL_CASH_THRESHOLD_DOLLARS } from "@/lib/referral";
import { requestRedemption } from "./actions";

type Funnel = { referred_name: string; status: string; paid_invoice_count: number; matured_at: string | null };
type Redemption = { id: string; kind: string; amount_cents: number; status: string; reference: string | null; created_at: string };
export type ReferralData = { link: string; code: string; funnel: Funnel[]; balanceCents: number; redemptions: Redemption[] };

export function ReferralsSection({ referral }: { referral: ReferralData }) {
  const t = useTranslations("settings");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const balance = referral.balanceCents;
  const canCash = balance >= REFERRAL_CASH_THRESHOLD_CENTS;

  function copy() {
    navigator.clipboard?.writeText(referral.link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }
  function redeem(kind: "bill" | "cash") {
    if (balance <= 0) return;
    start(async () => { const r = await requestRedemption(kind, balance); setMsg(r.ok ? t("referralRequested") : t("referralError")); });
  }

  return (
    <Card className="space-y-5">
      <div>
        <Heading className="text-[18px]">{t("referralTitle")}</Heading>
        <p className="mt-1 font-accent text-[15px] text-text-meta">{t("referralIntro", { credit: REFERRAL_CREDIT_DOLLARS, n: REFERRAL_INVOICES, cash: REFERRAL_CASH_THRESHOLD_DOLLARS })}</p>
      </div>

      <div>
        <p className="mb-1 text-[12px] font-medium uppercase tracking-[0.14em] text-taupe">{t("referralLinkLabel")}</p>
        <div className="flex gap-2">
          <input readOnly value={referral.link} className="flex-1 rounded-[var(--radius)] border border-hairline-token bg-surface-card px-3 py-2 text-[13px] text-text-primary" />
          <button onClick={copy} className="rounded-[var(--radius)] bg-ink px-4 py-2 text-[12px] font-medium text-bone">{copied ? t("referralCopied") : t("referralCopy")}</button>
        </div>
      </div>

      <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card p-4">
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-taupe">{t("referralBalance")}</p>
        <p className="mt-0.5 font-display text-[24px] text-text-primary">{formatCents(balance)}</p>
        {msg ? <p className="mt-1 text-[12.5px] text-teal">{msg}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => redeem("bill")} disabled={pending || balance <= 0} className="rounded-[var(--radius)] border border-ink px-4 py-2 text-[12.5px] text-text-primary disabled:opacity-40">{t("referralApplyBill")}</button>
          <button onClick={() => redeem("cash")} disabled={pending || !canCash} className="rounded-[var(--radius)] border border-ink px-4 py-2 text-[12.5px] text-text-primary disabled:opacity-40">{canCash ? t("referralCashOut") : t("referralCashLocked", { cash: REFERRAL_CASH_THRESHOLD_DOLLARS })}</button>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-taupe">{t("referralFunnelTitle")}</p>
        {referral.funnel.length === 0 ? (
          <p className="font-accent text-[14px] text-text-meta">{t("referralNone")}</p>
        ) : (
          <div className="rounded-[var(--radius)] border border-hairline-token">
            {referral.funnel.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border-b border-hairline-token px-3.5 py-2 text-[13px] last:border-b-0">
                <span className="truncate text-text-primary">{f.referred_name}</span>
                <span className="text-text-meta">{t("referralProgress", { n: f.paid_invoice_count, of: REFERRAL_INVOICES })}</span>
                <Badge tone={f.status === "matured" ? "sage" : "sand"}>{t(`referralStatus_${f.status}`)}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {referral.redemptions.length ? (
        <div>
          <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-taupe">{t("referralRedemptions")}</p>
          <div className="rounded-[var(--radius)] border border-hairline-token">
            {referral.redemptions.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-b border-hairline-token px-3.5 py-2 text-[13px] last:border-b-0">
                <span className="text-text-meta">{r.created_at.slice(0, 10)}</span>
                <span className="text-text-primary">{t(`referralKind_${r.kind}`)} · {formatCents(r.amount_cents)}</span>
                <span className="text-text-meta">{t(`redemptionStatus_${r.status}`)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
