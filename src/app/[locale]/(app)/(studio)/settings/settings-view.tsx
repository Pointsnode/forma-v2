"use client";

import { useEffect, useState, useTransition } from "react";
import { intlTag } from "@/lib/intl";
import { routing, type Locale } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";

// Language endonyms — each language named in its own tongue, locale-invariant (a language
// picker always reads the same regardless of the active UI language). No catalog key.
const LANG_LABEL: Record<Locale, string> = { en: "English", es: "Español", fr: "Français", it: "Italiano" };
import { Card, Heading, Badge, DomainHeadCard, cx } from "@/components/ui";
import { seatBill, PRICE_ADMIN, PRICE_ADDITIONAL, PRICE_CONCIERGE } from "@/lib/pricing";
import type { DateFormat } from "@/lib/format-date";
import {
  saveRegion, setLocalePref, setAppearancePref, saveDisplayName, changeEmail, sendPasswordReset,
  signOutEverywhere, exportData, requestDeletion, undoDeletion,
  startSubscription, openBillingPortal,
} from "./actions";

export type Appearance = "default" | "bone" | "night";

export type SettingsData = {
  locale: string;
  appearance: Appearance;
  hasWorkspace: boolean;
  isOwner: boolean;
  displayName: string;
  email: string;
  timezone: string;
  dateFormat: DateFormat;
  plan: { accounts: number; conciergeSeats: number } | null;
  usage: { used: number; cap: number } | null;
  subscription: { status: string; currentPeriodEnd: string | null } | null;
  stripeConfigured: boolean;
  deletionRequestedAt: string | null;
};

type Section = "language" | "plan" | "account" | "privacy" | "usage";

// A curated IANA list — the zones a LatAm-first studio actually picks from. Not the full
// tz database (hundreds of entries) — the primary surfaces, honestly labelled.
const ZONES = [
  "America/Mexico_City", "America/Tijuana", "America/Cancun", "America/Bogota",
  "America/Lima", "America/Santiago", "America/Buenos_Aires", "America/Sao_Paulo",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/Madrid", "Europe/London", "UTC",
];

function money(n: number) { return `$${n.toLocaleString("en-US")}`; }

export function SettingsView({ data }: { data: SettingsData }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const pathname = usePathname();
  const [active, setActive] = useState<Section>("language");

  // Deep-link: /settings#plan opens the Plan section. Read the hash on mount and honour
  // hash changes (the account-menu "Manage plan" link).
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace("#", "") as Section;
      if (["language", "plan", "account", "privacy", "usage"].includes(h)) setActive(h);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const tabs: { id: Section; gated: boolean }[] = [
    { id: "language", gated: false },
    { id: "plan", gated: true },
    { id: "account", gated: false },
    { id: "privacy", gated: true },
    { id: "usage", gated: true },
  ];
  const visible = tabs.filter((tab) => !tab.gated || data.hasWorkspace);

  function go(id: Section) {
    setActive(id);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-5 mt-1 font-display text-[30px] text-text-primary">{t("title")}</h1>
      <div className="grid gap-6 md:grid-cols-[180px_1fr]">
        <nav className="flex gap-2 overflow-x-auto md:sticky md:top-[110px] md:h-max md:flex-col md:gap-1">
          {visible.map((tab) => (
            <button
              key={tab.id}
              onClick={() => go(tab.id)}
              className={cx(
                "whitespace-nowrap rounded-[var(--radius)] px-3.5 py-2 text-left text-[13px]",
                active === tab.id ? "bg-surface-chrome font-medium text-bone" : "text-text-meta hover:bg-surface-card hover:text-text-primary",
              )}
            >
              {t(`nav.${tab.id}`)}
            </button>
          ))}
        </nav>

        <div>
          {active === "language" && <LanguageSection data={data} router={router} pathname={pathname} />}
          {active === "plan" && data.hasWorkspace && <PlanSection data={data} />}
          {active === "account" && <AccountSection data={data} />}
          {active === "privacy" && data.hasWorkspace && <PrivacySection data={data} />}
          {active === "usage" && data.hasWorkspace && <UsageSection data={data} />}
        </div>
      </div>
    </div>
  );
}

// ── Language & region ──────────────────────────────────────────────────────────────
function LanguageSection({ data, router, pathname }: { data: SettingsData; router: ReturnType<typeof useRouter>; pathname: string }) {
  const t = useTranslations("settings");
  const [pending, start] = useTransition();
  const [tz, setTz] = useState(data.timezone);
  const [fmt, setFmt] = useState<DateFormat>(data.dateFormat);
  const [appearance, setAppearance] = useState<Appearance>(data.appearance);
  const [saved, setSaved] = useState(false);

  function pickLocale(locale: Locale) {
    if (locale === data.locale) return;
    start(async () => {
      await setLocalePref(locale);
      // Navigate to the same path in the chosen locale; next-intl maps it under as-needed.
      router.replace(pathname, { locale });
    });
  }

  function pickAppearance(next: Appearance) {
    if (next === appearance) return;
    setAppearance(next); // optimistic: the segmented control tracks the choice immediately
    start(async () => {
      await setAppearancePref(next);
      // The theme lives on the server render (the (app) layout reads the cookie), so refresh
      // to re-paint the whole shell in the new register rather than mutating the DOM here.
      router.refresh();
    });
  }

  function saveRegionPrefs() {
    start(async () => {
      const r = await saveRegion(tz, fmt);
      if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    });
  }

  const FORMATS: DateFormat[] = ["auto", "DMY", "MDY", "YMD"];
  return (
    <Card>
      <Heading className="text-[19px]">{t("langTitle")}</Heading>
      <p className="mb-4 mt-0.5 text-[12.5px] text-text-meta">{t("langHint")}</p>

      <div className="mb-6 flex flex-wrap gap-2">
        {routing.locales.map((l) => (
          <button
            key={l}
            onClick={() => pickLocale(l)}
            disabled={pending}
            className={cx(
              "rounded-[var(--radius)] px-4 py-1.5 text-[13px]",
              data.locale === l ? "bg-surface-chrome text-bone" : "bg-surface-card text-text-primary hover:bg-champagne",
            )}
          >
            {LANG_LABEL[l]}
          </button>
        ))}
      </div>

      <label className="mb-1 block text-[12px] font-medium text-text-primary">{t("appearance")}</label>
      <p className="mb-2 text-[12.5px] text-text-meta">{t("appearanceHint")}</p>
      <div className="mb-6 flex flex-wrap gap-2">
        {(["default", "bone", "night"] as Appearance[]).map((o) => (
          <button
            key={o}
            onClick={() => pickAppearance(o)}
            disabled={pending}
            className={cx(
              "rounded-[var(--radius)] px-4 py-1.5 text-[13px]",
              appearance === o ? "bg-surface-chrome text-bone" : "bg-surface-card text-text-primary hover:bg-champagne",
            )}
          >
            {t(`appearance_${o}`)}
          </button>
        ))}
      </div>

      <label className="mb-1 block text-[12px] font-medium text-text-primary">{t("timezone")}</label>
      <select value={tz} onChange={(e) => setTz(e.target.value)} className="mb-4 w-full max-w-sm rounded-[var(--radius)] border border-hairline-token bg-surface-card px-3 py-2 text-[13px]">
        {ZONES.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
      </select>

      <label className="mb-1 block text-[12px] font-medium text-text-primary">{t("dateFormat")}</label>
      <select value={fmt} onChange={(e) => setFmt(e.target.value as DateFormat)} className="mb-5 w-full max-w-sm rounded-[var(--radius)] border border-hairline-token bg-surface-card px-3 py-2 text-[13px]">
        {FORMATS.map((f) => <option key={f} value={f}>{t(`fmt_${f}`)}</option>)}
      </select>

      <div className="flex items-center gap-3">
        <button onClick={saveRegionPrefs} disabled={pending} className="rounded-[var(--radius)] bg-surface-chrome px-5 py-2 text-[13px] text-bone hover:opacity-90 disabled:opacity-50">{t("save")}</button>
        {saved ? <span className="text-[12.5px] text-teal">{t("saved")}</span> : null}
      </div>
    </Card>
  );
}

// ── Plan & billing (§F: seatBill breakdown + the live subscription status/controls) ──
const LIVE = new Set(["active", "trialing", "past_due"]);
function PlanSection({ data }: { data: SettingsData }) {
  const t = useTranslations("settings");
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);
  const bill = data.plan ? seatBill(data.plan.accounts, data.plan.conciergeSeats) : null;
  const status = data.subscription?.status ?? "none";
  const isLive = LIVE.has(status);

  // Server action → Stripe-hosted URL → full-page redirect (Checkout / Portal are external).
  function goto(action: () => Promise<{ url?: string; error?: string }>) {
    setErr(false);
    start(async () => {
      const r = await action();
      if (r.url) window.location.href = r.url;
      else setErr(true);
    });
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <DomainHeadCard domain="money" title={t("planTitle")}>
        <p className="mb-4 text-[12.5px] text-text-meta">{t("planHint")}</p>
        {bill ? (
          <div className="max-w-sm space-y-2 text-[13px]">
            <div className="flex items-center justify-between"><span className="text-text-meta">{t("lineAdmin", { price: money(PRICE_ADMIN) })}</span><span className="text-text-primary">{money(PRICE_ADMIN)}</span></div>
            {bill.additional > 0 ? (
              <div className="flex items-center justify-between"><span className="text-text-meta">{t("lineAdditional", { count: bill.additional, price: money(PRICE_ADDITIONAL) })}</span><span className="text-text-primary">{money(PRICE_ADDITIONAL * bill.additional)}</span></div>
            ) : null}
            {bill.conciergeSeats > 0 ? (
              <div className="flex items-center justify-between"><span className="text-text-meta">{t("lineConcierge", { count: bill.conciergeSeats, price: money(PRICE_CONCIERGE) })}</span><span className="text-text-primary">{money(PRICE_CONCIERGE * bill.conciergeSeats)}</span></div>
            ) : null}
            <div className="flex items-center justify-between border-t border-hairline-token pt-2">
              <span className="font-medium text-text-primary">{t("monthlyTotal")}</span>
              <span className="font-display text-[20px] text-text-primary">{money(bill.total)}<span className="text-[13px] text-text-meta">{t("perMonth")}</span></span>
            </div>
            <p className="pt-1 text-[11.5px] text-text-meta">{t("seatsOnTeam")}</p>
          </div>
        ) : null}
      </DomainHeadCard>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Heading className="text-[16px]">{t("subscriptionTitle")}</Heading>
            {!data.stripeConfigured ? (
              // Honest not-connected state — no dead button (mirrors /billing when unconfigured).
              <p className="mt-0.5 text-[12.5px] text-text-meta">{t("subNotConnected")}</p>
            ) : isLive ? (
              <p className="mt-0.5 text-[12.5px] text-text-meta">
                {t(`status_${status}`)}
                {data.subscription?.currentPeriodEnd ? ` · ${t("renewsOn", { date: new Date(data.subscription.currentPeriodEnd).toLocaleDateString(intlTag(data.locale)) })}` : ""}
              </p>
            ) : (
              <p className="mt-0.5 text-[12.5px] text-text-meta">{status === "canceled" ? t("status_canceled") : t("subStartHint")}</p>
            )}
          </div>
          {data.stripeConfigured ? (
            isLive ? (
              <Badge tone="sage">{t(`status_${status}`)}</Badge>
            ) : (
              <Badge tone="sand">{t("status_none")}</Badge>
            )
          ) : (
            <Badge tone="sand">{t("subComingSoon")}</Badge>
          )}
        </div>

        {data.stripeConfigured && data.isOwner ? (
          <div className="mt-4 flex items-center gap-3">
            {isLive ? (
              <button onClick={() => goto(openBillingPortal)} disabled={pending} className="rounded-[var(--radius)] border border-[color:var(--color-text-primary)] px-5 py-2 text-[13px] text-text-primary hover:bg-surface-chrome hover:text-bone disabled:opacity-50">{t("managePlanBtn")}</button>
            ) : (
              <button onClick={() => goto(startSubscription)} disabled={pending} className="rounded-[var(--radius)] bg-surface-chrome px-5 py-2 text-[13px] text-bone hover:opacity-90 disabled:opacity-50">{t("startSubscription")}</button>
            )}
            {err ? <span className="text-[12.5px] text-[color:var(--color-text-danger)]">{t("subErr")}</span> : null}
          </div>
        ) : null}
      </Card>

      <Link href="/billing" className="text-[13px] text-text-primary underline underline-offset-2 hover:opacity-70">{t("paymentsLink")}</Link>
    </div>
  );
}

// ── Account ─────────────────────────────────────────────────────────────────────────
function AccountSection({ data }: { data: SettingsData }) {
  const t = useTranslations("settings");
  const [pending, start] = useTransition();
  const [name, setName] = useState(data.displayName);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function flash(k: string) { setMsg(k); setTimeout(() => setMsg(null), 3000); }

  return (
    <Card>
      <Heading className="text-[19px]">{t("accountTitle")}</Heading>
      <p className="mb-5 mt-0.5 text-[12.5px] text-text-meta">{t("accountHint")}</p>

      <label className="mb-1 block text-[12px] font-medium text-text-primary">{t("displayName")}</label>
      <div className="mb-5 flex max-w-md gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-[var(--radius)] border border-hairline-token bg-surface-card px-3 py-2 text-[13px]" />
        <button onClick={() => start(async () => { const r = await saveDisplayName(name); flash(r.ok ? "nameSaved" : "err"); })} disabled={pending} className="rounded-[var(--radius)] bg-surface-chrome px-4 py-2 text-[13px] text-bone hover:opacity-90 disabled:opacity-50">{t("save")}</button>
      </div>

      <label className="mb-1 block text-[12px] font-medium text-text-primary">{t("email")}</label>
      <p className="mb-2 text-[13px] text-text-primary">{data.email}</p>
      <div className="mb-5 flex max-w-md gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("newEmailPlaceholder")} className="flex-1 rounded-[var(--radius)] border border-hairline-token bg-surface-card px-3 py-2 text-[13px]" />
        <button onClick={() => start(async () => { const r = await changeEmail(email); flash(r.ok ? "emailSent" : "err"); if (r.ok) setEmail(""); })} disabled={pending || !email} className="rounded-[var(--radius)] border border-[color:var(--color-text-primary)] px-4 py-2 text-[13px] text-text-primary hover:bg-surface-chrome hover:text-bone disabled:opacity-40">{t("changeEmail")}</button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-hairline-token pt-5">
        <button onClick={() => start(async () => { const r = await sendPasswordReset(); flash(r.ok ? "resetSent" : "err"); })} disabled={pending} className="rounded-[var(--radius)] border border-[color:var(--color-text-primary)] px-4 py-2 text-[13px] text-text-primary hover:bg-surface-chrome hover:text-bone disabled:opacity-50">{t("changePassword")}</button>
        <button onClick={() => start(() => signOutEverywhere())} disabled={pending} className="rounded-[var(--radius)] border border-wine px-4 py-2 text-[13px] text-[color:var(--color-text-danger)] hover:bg-wine hover:text-bone disabled:opacity-50">{t("signOutEverywhere")}</button>
      </div>

      {msg ? <p className="mt-4 text-[12.5px] text-teal">{t(`msg.${msg}`)}</p> : null}
    </Card>
  );
}

// ── Privacy ─────────────────────────────────────────────────────────────────────────
function PrivacySection({ data }: { data: SettingsData }) {
  const t = useTranslations("settings");
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState(false);

  function download() {
    start(async () => {
      const r = await exportData();
      if (!r.ok || !r.json) { setErr(true); return; }
      const blob = new Blob([r.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = r.filename ?? "forma-export.json";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <Card>
        <Heading className="text-[19px]">{t("dataExportTitle")}</Heading>
        <p className="mb-4 mt-0.5 text-[12.5px] text-text-meta">{t("dataExportHint")}</p>
        <button onClick={download} disabled={pending} className="rounded-[var(--radius)] bg-surface-chrome px-5 py-2 text-[13px] text-bone hover:opacity-90 disabled:opacity-50">{t("downloadData")}</button>
        {err ? <p className="mt-3 text-[12.5px] text-[color:var(--color-text-danger)]">{t("exportErr")}</p> : null}
      </Card>

      <Card>
        <Heading className="text-[16px]">{t("deleteTitle")}</Heading>
        {data.deletionRequestedAt ? (
          <>
            <p className="mb-3 mt-0.5 text-[12.5px] text-[color:var(--color-text-danger)]">{t("deletePending")}</p>
            <button onClick={() => start(async () => { await undoDeletion(); })} disabled={pending} className="rounded-[var(--radius)] border border-[color:var(--color-text-primary)] px-4 py-2 text-[13px] text-text-primary hover:bg-surface-chrome hover:text-bone disabled:opacity-50">{t("undoDelete")}</button>
          </>
        ) : !data.isOwner ? (
          <p className="mt-0.5 text-[12.5px] text-text-meta">{t("deleteOwnerOnly")}</p>
        ) : !confirming ? (
          <>
            <p className="mb-3 mt-0.5 text-[12.5px] text-text-meta">{t("deleteHint")}</p>
            <button onClick={() => setConfirming(true)} className="rounded-[var(--radius)] border border-wine px-4 py-2 text-[13px] text-[color:var(--color-text-danger)] hover:bg-wine hover:text-bone">{t("requestDelete")}</button>
          </>
        ) : (
          <>
            <p className="mb-3 mt-0.5 text-[12.5px] text-[color:var(--color-text-danger)]">{t("deleteConfirm")}</p>
            <div className="flex gap-2">
              <button onClick={() => start(async () => { await requestDeletion(); setConfirming(false); })} disabled={pending} className="rounded-[var(--radius)] bg-wine px-4 py-2 text-[13px] text-bone hover:opacity-90 disabled:opacity-50">{t("deleteConfirmYes")}</button>
              <button onClick={() => setConfirming(false)} className="rounded-[var(--radius)] border border-[color:var(--color-text-primary)] px-4 py-2 text-[13px] text-text-primary hover:bg-surface-card">{t("cancel")}</button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ── Usage (read-only mirror; the levers stay on Team) ────────────────────────────────
function UsageSection({ data }: { data: SettingsData }) {
  const t = useTranslations("settings");
  const usage = data.usage;
  const plan = data.plan;
  const pct = usage && usage.cap > 0 ? Math.min(100, Math.round((usage.used / usage.cap) * 100)) : 0;
  const fmtTokens = (n: number) => new Intl.NumberFormat("en-US").format(n);

  return (
    <div className="flex flex-col gap-[18px]">
      <Card>
        <Heading className="text-[19px]">{t("usageTokensTitle")}</Heading>
        <p className="mb-4 mt-0.5 text-[12.5px] text-text-meta">{t("usageTokensHint")}</p>
        {usage && usage.cap > 0 ? (
          <>
            <div className="mb-1.5 flex items-center justify-between text-[13px]">
              <span className="text-text-meta">{t("tokensUsed", { used: fmtTokens(usage.used), cap: fmtTokens(usage.cap) })}</span>
              <span className="font-medium text-text-primary">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-[var(--radius)] bg-surface-card">
              <div className={cx("h-full rounded-[var(--radius)]", pct >= 100 ? "bg-wine" : "bg-surface-chrome")} style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <p className="text-[13px] text-text-meta">{t("usageNoConcierge")}</p>
        )}
        <Link href="/team" className="mt-4 inline-block text-[12.5px] text-text-primary underline underline-offset-2 hover:opacity-70">{t("manageConcierge")}</Link>
      </Card>

      <Card>
        <Heading className="text-[16px]">{t("usageSeatsTitle")}</Heading>
        {plan ? (
          <div className="mt-2 flex gap-8 text-[13px]">
            <div><div className="font-display text-[24px] text-text-primary">{plan.accounts}</div><div className="text-text-meta">{t("seatsAccounts")}</div></div>
            <div><div className="font-display text-[24px] text-text-primary">{plan.conciergeSeats}</div><div className="text-text-meta">{t("seatsConcierge")}</div></div>
          </div>
        ) : null}
        <Link href="/team" className="mt-4 inline-block text-[12.5px] text-text-primary underline underline-offset-2 hover:opacity-70">{t("manageSeats")}</Link>
      </Card>
    </div>
  );
}
