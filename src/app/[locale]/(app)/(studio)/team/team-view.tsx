"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Card, SectionTitle, Stat, StatRow, Row, RowMain, Monogram, Button, cx } from "@/components/ui";
import { formaErrorMessage } from "@/lib/forma-error";
import { CLEARANCE_BOXES, PRESETS, hasClearance, type ClearanceKey } from "@/lib/clearance";
import { seatBill, PRICE_ADMIN, PRICE_ADDITIONAL, PRICE_CONCIERGE } from "@/lib/pricing";
import { inviteMember, setClearances, removeMember, revokeInvite, setConciergeCap } from "./actions";

export type RosterMember = {
  userId: string; name: string; email: string; avatarUrl: string | null;
  grants: string[]; title: string | null; joined: string;
};
export type PendingInvite = { id: string; email: string; grants: string[]; title: string | null; token: string; expiresAt: string };

const INPUT = "w-full rounded-xl bg-bone px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-sand";

function money(n: number) { return `$${n.toLocaleString("en-US")}`; }
function nameInitials(name: string) {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

// A clearance box grid: preset quick-sets on top, then the 12 toggles. 'admin' covers
// everything, so when it's ticked the other boxes read as implied-on and are locked.
function BoxGrid({ value, onChange, disabled }: { value: string[]; onChange: (g: string[]) => void; disabled?: boolean }) {
  const t = useTranslations("team");
  const isAdmin = value.includes("admin");
  function toggle(k: ClearanceKey) {
    if (disabled) return;
    if (k === "admin") { onChange(isAdmin ? [] : ["admin"]); return; }
    if (isAdmin) return; // implied — locked
    onChange(value.includes(k) ? value.filter((g) => g !== k) : [...value, k]);
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" disabled={disabled}
            onClick={() => onChange([...p.grants])}
            className="rounded-full border border-hairline px-3 py-1 text-[12px] text-muted hover:border-ink hover:text-ink disabled:opacity-50">
            {t(`preset.${p.key}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CLEARANCE_BOXES.map((k) => {
          const on = hasClearance(value, k);
          const locked = disabled || (isAdmin && k !== "admin");
          return (
            <button key={k} type="button" onClick={() => toggle(k)} disabled={locked && !on}
              aria-pressed={on}
              className={cx(
                "rounded-full px-3 py-1 text-[12px] transition",
                on ? "bg-ink text-bone" : "border border-hairline text-muted hover:border-ink hover:text-ink",
                locked ? "cursor-default" : "cursor-pointer",
              )}>
              {t(`box.${k}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BoxChips({ grants }: { grants: string[] }) {
  const t = useTranslations("team");
  if (grants.includes("admin")) return <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11.5px] text-bone">{t("box.admin")}</span>;
  if (grants.length === 0) return <span className="text-[12px] text-muted">{t("noBoxes")}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {CLEARANCE_BOXES.filter((k) => grants.includes(k)).map((k) => (
        <span key={k} className="rounded-full bg-bone px-2.5 py-0.5 text-[11.5px] text-ink">{t(`box.${k}`)}</span>
      ))}
    </span>
  );
}

function MemberRow({ member, isAdmin }: { member: RosterMember; isAdmin: boolean }) {
  const t = useTranslations("team");
  const te = useTranslations("errors");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [grants, setGrants] = useState<string[]>(member.grants);
  const [title, setTitle] = useState(member.title ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setErr(null);
    start(async () => {
      const r = await setClearances(member.userId, grants, title);
      if (r.ok) { setEditing(false); router.refresh(); } else setErr(formaErrorMessage(r, te));
    });
  }
  function remove() {
    setErr(null);
    start(async () => {
      const r = await removeMember(member.userId);
      if (r.ok) router.refresh(); else setErr(formaErrorMessage(r, te));
    });
  }

  return (
    <div className="[box-shadow:inset_0_-1px_0_var(--color-hairline)] last:shadow-none">
      <div className="flex items-center gap-3 py-3">
        <Monogram initials={nameInitials(member.name)} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-ink">{member.name}{member.title ? <span className="ml-2 font-accent text-[13px] italic text-muted">{member.title}</span> : null}</p>
          <p className="truncate text-[12.5px] text-muted">{member.email}</p>
        </div>
        <div className="hidden md:block"><BoxChips grants={member.grants} /></div>
        {isAdmin ? (
          <Button variant="ghost" onClick={() => setEditing((v) => !v)} className="shrink-0 text-[12px]">
            {editing ? t("close") : t("edit")}
          </Button>
        ) : null}
      </div>
      <div className="pb-3 md:hidden"><BoxChips grants={member.grants} /></div>
      {editing && isAdmin ? (
        <div className="mb-3 flex flex-col gap-3 rounded-xl bg-bone/60 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">{t("titleLabel")}</span>
            <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} />
          </label>
          <BoxGrid value={grants} onChange={setGrants} disabled={pending} />
          {err ? <p className="text-[13px] text-wine">{err}</p> : null}
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={pending}>{t("saveClearances")}</Button>
            <Button variant="ghost" onClick={remove} disabled={pending} className="text-wine">{t("removeMember")}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InviteForm() {
  const t = useTranslations("team");
  const te = useTranslations("errors");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [grants, setGrants] = useState<string[]>([...PRESETS[1].grants]); // default: planner preset
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setErr(null);
    start(async () => {
      const r = await inviteMember(email.trim(), grants, title.trim());
      if (r.ok) {
        setEmail(""); setTitle("");
        // The new invite (with its copy-link) appears in the pending list on refresh.
        router.refresh();
      } else setErr(formaErrorMessage(r, te));
    });
  }

  return (
    <Card>
      <SectionTitle title={t("inviteTitle")} accent={t("inviteHint")} />
      <div className="mt-4 flex flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">{t("emailLabel")}</span>
            <input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@studio.com" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">{t("titleLabel")}</span>
            <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} />
          </label>
        </div>
        <BoxGrid value={grants} onChange={setGrants} disabled={pending} />
        {err ? <p className="text-[13px] text-wine">{err}</p> : null}
        <div>
          <Button onClick={submit} disabled={pending || !email.trim()}>{t("sendInvite")}</Button>
        </div>
      </div>
    </Card>
  );
}

function PendingList({ pending, locale }: { pending: PendingInvite[]; locale: string }) {
  const t = useTranslations("team");
  const te = useTranslations("errors");
  const router = useRouter();
  const [busy, start] = useTransition();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (pending.length === 0) return null;
  const linkFor = (token: string) => `${typeof window !== "undefined" ? window.location.origin : ""}${locale === "es" ? "/es" : ""}/join/team/${token}`;
  return (
    <Card>
      <SectionTitle title={t("pendingTitle")} accent={t("pendingHint")} />
      <div className="mt-3">
        {pending.map((inv) => (
          <Row key={inv.id}>
            <div className="min-w-0 flex-1">
              <RowMain title={inv.email} detail={inv.title ?? undefined} />
              <div className="mt-1"><BoxChips grants={inv.grants} /></div>
            </div>
            <Button variant="ghost" className="text-[12px]" onClick={() => { navigator.clipboard.writeText(linkFor(inv.token)); setCopiedId(inv.id); }}>
              {copiedId === inv.id ? t("copied") : t("copyLink")}
            </Button>
            <Button variant="ghost" className="text-[12px] text-wine" disabled={busy}
              onClick={() => { setErr(null); start(async () => { const r = await revokeInvite(inv.id); if (r.ok) router.refresh(); else setErr(formaErrorMessage(r, te)); }); }}>
              {t("revoke")}
            </Button>
          </Row>
        ))}
        {err ? <p className="mt-2 text-[13px] text-wine">{err}</p> : null}
      </div>
    </Card>
  );
}

function SeatPanel({ accounts, conciergeSeats }: { accounts: number; conciergeSeats: number }) {
  const t = useTranslations("team");
  const bill = seatBill(accounts, conciergeSeats);
  return (
    <Card>
      <SectionTitle title={t("seatTitle")} accent={t("seatHint")} />
      <div className="mt-4 flex flex-col gap-2 text-[14px]">
        <div className="flex items-center justify-between"><span className="text-muted">{t("lineAdmin")}</span><span className="text-ink">{money(PRICE_ADMIN)}</span></div>
        {bill.additional > 0 ? (
          <div className="flex items-center justify-between"><span className="text-muted">{t("lineAdditional", { count: bill.additional, price: money(PRICE_ADDITIONAL) })}</span><span className="text-ink">{money(PRICE_ADDITIONAL * bill.additional)}</span></div>
        ) : null}
        {bill.conciergeSeats > 0 ? (
          <div className="flex items-center justify-between"><span className="text-muted">{t("lineConcierge", { count: bill.conciergeSeats, price: money(PRICE_CONCIERGE) })}</span><span className="text-ink">{money(PRICE_CONCIERGE * bill.conciergeSeats)}</span></div>
        ) : null}
        <div className="mt-1 flex items-center justify-between [box-shadow:inset_0_1px_0_var(--color-hairline)] pt-3">
          <span className="font-medium text-ink">{t("lineTotal")}</span>
          <span className="font-display text-[20px] text-ink">{money(bill.total)}<span className="text-[13px] text-muted">{t("perMonth")}</span></span>
        </div>
      </div>
      <p className="mt-4 font-accent text-[13px] italic text-muted">{t("billingNote")}</p>
      {/* §F period-boundary reconciliation: seat changes here never write to Stripe mid-cycle. */}
      <p className="mt-1 text-[11.5px] text-muted">{t("nextPeriodNote")}</p>
    </Card>
  );
}

function ConciergeSettings({ roster, concierge, isAdmin }: { roster: RosterMember[]; concierge: { enabled: boolean; used: number; cap: number }; isAdmin: boolean }) {
  const t = useTranslations("team");
  const te = useTranslations("errors");
  const router = useRouter();
  const [cap, setCap] = useState(String(concierge.cap));
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const withConcierge = roster.filter((m) => m.grants.includes("admin") || m.grants.includes("concierge"));
  const pct = concierge.cap > 0 ? Math.min(100, Math.round((concierge.used / concierge.cap) * 100)) : 0;

  return (
    <Card>
      <SectionTitle title={t("conciergeTitle")} accent={t("conciergeHint")} />
      <div className="mt-4 flex flex-col gap-5">
        <div>
          <div className="mb-1 flex items-center justify-between text-[13px]">
            <span className="text-muted">{t("usageLabel")}</span>
            <span className="text-ink">{concierge.used.toLocaleString("en-US")} / {concierge.cap.toLocaleString("en-US")} {t("tokens")}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-bone"><div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} /></div>
        </div>
        {isAdmin ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">{t("capLabel")}</span>
            <div className="flex items-center gap-2">
              <input className={cx(INPUT, "max-w-[220px]")} inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^0-9]/g, ""))} />
              <Button disabled={pending} onClick={() => { setErr(null); setSaved(false); start(async () => { const r = await setConciergeCap(Number(cap || "0")); if (r.ok) { setSaved(true); router.refresh(); } else setErr(formaErrorMessage(r, te)); }); }}>
                {saved ? t("saved") : t("saveCap")}
              </Button>
            </div>
            {err ? <p className="text-[13px] text-wine">{err}</p> : null}
          </div>
        ) : null}
        <div>
          <p className="mb-2 text-[12px] text-muted">{t("whoConcierge")}</p>
          {withConcierge.length === 0 ? (
            <p className="text-[13px] text-muted">{t("noneConcierge")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {withConcierge.map((m) => (
                <span key={m.userId} className="flex items-center gap-2 rounded-full bg-bone px-3 py-1 text-[12.5px] text-ink">
                  <Monogram initials={nameInitials(m.name)} size={20} />{m.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function TeamView({
  locale, isAdmin, roster, pending, accounts, conciergeSeats, weddingsCount, concierge,
}: {
  locale: string; isAdmin: boolean; roster: RosterMember[]; pending: PendingInvite[];
  accounts: number; conciergeSeats: number; weddingsCount: number; concierge: { enabled: boolean; used: number; cap: number };
}) {
  const t = useTranslations("team");
  return (
    <div className="flex flex-col gap-6 py-2">
      <StatRow>
        <Stat value={String(accounts)} label={t("statAccounts")} />
        <Stat value={String(weddingsCount)} label={t("statWeddings")} />
        <Stat value={money(seatBill(accounts, conciergeSeats).total)} label={t("statMonthly")} />
      </StatRow>

      <Card>
        <SectionTitle title={t("rosterTitle")} accent={t("rosterHint")} />
        <div className="mt-2">
          {roster.map((m) => <MemberRow key={m.userId} member={m} isAdmin={isAdmin} />)}
        </div>
      </Card>

      {isAdmin ? <InviteForm /> : null}
      {isAdmin ? <PendingList pending={pending} locale={locale} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SeatPanel accounts={accounts} conciergeSeats={conciergeSeats} />
        {concierge.enabled ? <ConciergeSettings roster={roster} concierge={concierge} isAdmin={isAdmin} /> : null}
      </div>
    </div>
  );
}
