import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { PhaseDots, DomainStar, SignedFooter, cx } from "@/components/ui";
import {
  countdownDays, dayNumber, formatDateRange, formatMoney, itemsToGate,
  phaseOrdinal, type EventRow, type WeddingRow,
} from "@/lib/wedding";

export type WeddingTab = "overview" | "whatsnext" | "proposals" | "guests" | "vendors" | "budget" | "contracts" | "tasks" | "design" | "documents" | "planning" | "seating";

// The wedding shell — full-bleed ink masthead (eyebrow · display couple name ·
// meta · event chips · the slim planning line as its bottom edge), the sticky
// wedding nav row, then the centered content. One composed region, not a rounded
// card floating on cream. Event pages pass showNav={false} and render their own
// breadcrumb + sub-nav in the content.
export async function WeddingShell({
  wedding, events, role, active = null, activeEventId = null, venuedEventIds, showNav = true, children,
}: {
  wedding: WeddingRow;
  events: EventRow[];
  role: "staff" | "member";
  active?: WeddingTab | null;
  activeEventId?: string | null;
  venuedEventIds?: Set<string>;
  showNav?: boolean;
  children: ReactNode;
}) {
  const [tw, te, tp, tg, teng, tm, tc, tops, ttask, tcp] = [
    await getTranslations("wedding"), await getTranslations("event"), await getTranslations("phase"),
    await getTranslations("guests"), await getTranslations("engagement"),
    await getTranslations("money"), await getTranslations("contract"), await getTranslations("ops"),
    await getTranslations("tasks"), await getTranslations("couple"),
  ];
  const lang = await getLocale();

  const range = formatDateRange(wedding.date_start, wedding.date_end, lang);
  const days = countdownDays(wedding.date_start);
  const money = formatMoney(wedding.budget_total, lang);
  const eyebrow = [
    wedding.kind ? tw(`create.kind${wedding.kind === "city" ? "City" : "Destination"}`) : null,
    [wedding.location_city, wedding.location_country].filter(Boolean).join(", ") || null,
  ].filter(Boolean).join(" · ");
  const meta = [
    range,
    events.length === 1 ? tw("eventCountOne") : tw("eventCountOther", { count: events.length }),
    wedding.guest_target ? tw("guestsLabel", { count: wedding.guest_target }) : null,
    money,
  ].filter(Boolean).join("  ·  ");

  const multi = events.length >= 2;
  // The phase-1 line must reflect the two Phase-1 conditions (agreement completed /
  // deposit paid), not default to "ready" — gateItems only models the 2→3 gate.
  let n = itemsToGate(wedding, events, venuedEventIds);
  if (wedding.phase === "hiring") {
    const supabase = await createClient();
    const { data: c } = await supabase.from("contracts").select("id").eq("wedding_id", wedding.id).eq("kind", "planner_agreement").eq("status", "completed").limit(1).maybeSingle();
    let depositPaid = false;
    if (c) {
      const { data: l } = await supabase.from("ledger_lines").select("id").eq("contract_id", c.id).eq("kind", "planner_fee").eq("status", "paid").limit(1);
      depositPaid = !!(l && l.length);
    }
    n = (c ? 0 : 1) + (depositPaid ? 0 : 1);
  }
  const phaseStatus =
    wedding.phase === "closed" ? tp("closedState")
      : n === 0 ? tp("atGate")
      : n === 1 ? tp("itemsToGateOne")
      : tp("itemsToGateOther", { count: n });

  // §A Seating: staff always; the couple only when a plan on this wedding has couple_can_edit
  // (the flag is per-plan/per-event — the tab follows "any plan is open to the couple").
  let coupleSeating = false;
  if (role === "member") {
    const sb = await createClient();
    const { data: openPlan } = await sb.from("floor_plans").select("id").eq("wedding_id", wedding.id).eq("couple_can_edit", true).limit(1).maybeSingle();
    coupleSeating = !!openPlan;
  }

  const seatingTab = { key: "seating" as const, href: `/wedding/${wedding.id}/seating`, label: tops("seatingTab") };
  const tabs: { key: WeddingTab; href: string; label: string }[] =
    role === "staff"
      ? [
          { key: "overview", href: `/wedding/${wedding.id}`, label: tw("overview") },
          { key: "whatsnext", href: `/wedding/${wedding.id}/whats-next`, label: tops("whatsNextTab") },
          { key: "guests", href: `/wedding/${wedding.id}/guests`, label: tg("tab") },
          { key: "vendors", href: `/wedding/${wedding.id}/vendors`, label: teng("tab") },
          { key: "budget", href: `/wedding/${wedding.id}/budget`, label: tm("tab") },
          { key: "contracts", href: `/wedding/${wedding.id}/contracts`, label: tc("tab") },
          { key: "tasks", href: `/wedding/${wedding.id}/tasks`, label: ttask("tab") },
          { key: "design", href: `/wedding/${wedding.id}/design`, label: tops("designTab") },
          seatingTab,
          { key: "documents", href: `/wedding/${wedding.id}/documents`, label: tops("documentsTab") },
        ]
      : [
          { key: "overview", href: `/wedding/${wedding.id}`, label: tw("overview") },
          { key: "whatsnext", href: `/wedding/${wedding.id}/whats-next`, label: tops("whatsNextTab") },
          { key: "guests", href: `/wedding/${wedding.id}/guests`, label: tg("tab") },
          ...(coupleSeating ? [seatingTab] : []),
          { key: "design", href: `/wedding/${wedding.id}/design`, label: tops("designTab") },
          { key: "documents", href: `/wedding/${wedding.id}/documents`, label: tops("documentsTab") },
        ];

  return (
    <div>
      {/* ── full-bleed ink masthead ─────────────────────────────────────────── */}
      <div className="bg-ink text-bone">
        {role === "member" ? (
          // The couple invitation header (Edition One couple register): centered, bone star,
          // THE WEDDING OF, Playfair names, champagne meta. Real names/date/city; the days
          // counter drops once the date passes. No planning strip (the phase is the planner's).
          <div className="mx-auto max-w-[1240px] px-8 py-14 text-center md:px-10">
            <DomainStar fill="#F5F2EB" size={22} />
            <p className="mt-4 text-[10px] font-medium uppercase tracking-[0.24em] text-champagne">{tcp("theWeddingOf")}</p>
            <h1 className="mt-2.5 font-display text-[46px] leading-[1.05] text-bone">{wedding.couple_display}</h1>
            <p className="mt-3.5 text-[11px] uppercase tracking-[0.22em] text-champagne">
              {[range, location || null, days != null && days >= 0 && wedding.phase !== "closed" ? `${days} ${tw("days")}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
        ) : (
          <>
            <div className="mx-auto max-w-[1240px] px-8 pt-[34px] md:px-10">
              {/* Edition One kicker (the reference's "THE WEDDING"); kind · city folds into the meta. */}
              <p className="mb-2.5 text-[10px] font-medium uppercase tracking-[0.24em] text-champagne">{tw("theWedding")}</p>
              <h1 className="font-display text-[40px] leading-[1.08]">{wedding.couple_display}</h1>
              <p className="mt-2 text-[13.5px] text-[#CFC7B9]">
                {range ? <span className="font-accent text-[16px] italic text-champagne">{range}</span> : null}
                {meta && range ? <span> &nbsp;·&nbsp; </span> : null}
                {[
                  events.length === 1 ? tw("eventCountOne") : tw("eventCountOther", { count: events.length }),
                  wedding.guest_target ? tw("guestsLabel", { count: wedding.guest_target }) : null,
                  money,
                ].filter(Boolean).join("  ·  ")}
                {days != null ? <span className="ml-3 text-[#948C7F]">· {wedding.phase === "closed" ? tw("settled") : days >= 0 ? `${days} ${tw("days")}` : tw("daysAgo", { count: -days })}</span> : null}
                {eyebrow ? <span className="ml-3 text-[#948C7F]">· {eyebrow}</span> : null}
              </p>

              {/* Single-event law: no chip row exists until a second event does. */}
              {multi ? (
                <div className="flex flex-wrap gap-2 pb-[18px] pt-[22px]">
                  <Chip href={`/wedding/${wedding.id}`} active={!activeEventId}>{tw("wholeWedding")}</Chip>
                  {events.map((e) => {
                    const dn = dayNumber(e.event_date, wedding.date_start);
                    const sub = [dn != null ? te("dayN", { n: dn }) : null, e.guest_target ? tw("guestsLabel", { count: e.guest_target }) : null].filter(Boolean).join(" · ");
                    return (
                      <Chip key={e.id} href={`/wedding/${wedding.id}/event/${e.id}`} active={activeEventId === e.id} sub={sub || undefined}>
                        {e.label}
                      </Chip>
                    );
                  })}
                </div>
              ) : (
                <div className="pb-[24px]" />
              )}
            </div>

            {/* the planning line as the masthead's bottom edge (staff only) */}
            <div className="border-t border-hairline-dark">
              <PhaseStrip
                wedding={wedding}
                role={role}
                planningLabel={tp("planning")}
                phaseLabel={`${tp("ordinal", { n: phaseOrdinal(wedding.phase) })} · ${tp(wedding.phase)}`}
                statusText={phaseStatus}
                openLabel={tp("openPlanning")}
              />
            </div>
          </>
        )}
      </div>

      {/* ── sticky wedding nav ──────────────────────────────────────────────── */}
      {showNav ? (
        <div className="sticky top-[62px] z-40 bg-ink">
          <nav className="mx-auto flex max-w-[1240px] gap-7 overflow-x-auto px-8 md:px-10">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className={cx(
                  "whitespace-nowrap border-b-2 pb-[13px] pt-[15px] text-[13px] transition-colors",
                  active === t.key ? "border-champagne text-bone" : "border-transparent text-[rgba(245,242,235,0.55)] hover:text-bone",
                )}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}

      <div className="mx-auto max-w-[1240px] px-8 pb-20 pt-8 md:px-10">{children}</div>
      {/* The signed footer is law on every couple surface. */}
      {role === "member" ? <SignedFooter heldLabel={tcp("held")} /> : null}
    </div>
  );
}

// The phase line — a clickable strip for staff (opens the planning room), a
// static indicator for the couple. Same phase truth either way (§9).
function PhaseStrip({
  wedding, role, planningLabel, phaseLabel, statusText, openLabel,
}: {
  wedding: WeddingRow;
  role: "staff" | "member";
  planningLabel: string;
  phaseLabel: string;
  statusText: string;
  openLabel: string;
}) {
  const inner = (
    <>
      <PhaseDots phase={wedding.phase} dark />
      <span className="text-[9.5px] uppercase tracking-[0.3em] text-[#948C7F]">{planningLabel}</span>
      <span className="font-display text-[14.5px] text-bone">{phaseLabel}</span>
      <span className="text-[12px] text-[#948C7F]">· {statusText}</span>
      {role === "staff" ? <span className="ml-auto text-[12px] tracking-[0.04em] text-champagne group-hover:text-bone">{openLabel} →</span> : null}
    </>
  );
  const cls = "mx-auto flex max-w-[1240px] flex-wrap items-baseline gap-x-3.5 gap-y-1 px-8 py-[11px] text-[12px] md:px-10";
  return role === "staff" ? (
    <Link href={`/wedding/${wedding.id}/planning`} className={cx("group", cls)}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function Chip({
  href, active, sub, children,
}: {
  href: React.ComponentProps<typeof Link>["href"];
  active: boolean;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "flex shrink-0 flex-col rounded-[var(--radius)] border px-4 py-[7px] text-[12.5px] transition-colors",
        active ? "border-transparent bg-bone text-ink" : "border-[rgba(245,242,235,0.16)] text-[rgba(245,242,235,0.65)] hover:text-bone",
      )}
    >
      <span>{children}</span>
      {sub ? <span className={cx("text-[10px] tracking-[0.02em]", active ? "text-taupe" : "text-[#948C7F]")}>{sub}</span> : null}
    </Link>
  );
}
