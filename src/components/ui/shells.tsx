import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cx } from "./cn";
import { Monogram, Chip, DomainStar, Wordmark, type Domain } from "./primitives";

// The signed footer — law on every couple/guest page. Champagne star above the bone
// wordmark (SignedMark anatomy on charcoal), then the held line. Full-bleed. NOTE: the
// studio NAME isn't readable on couple/guest surfaces (RLS gates workspaces to members,
// and no function changes this milestone), so the caller passes a name-free held line from
// the catalogs ("Held with care") rather than "Held by {studio}".
export function SignedFooter({ heldLabel }: { heldLabel: string }) {
  return (
    <footer className="relative left-1/2 w-screen -translate-x-1/2 bg-surface-chrome px-6 py-12 text-center text-bone">
      <div className="flex justify-center"><DomainStar fill="#D7C3A5" size={13} /></div>
      <div className="mt-2.5"><Wordmark size={19} className="!text-bone" /></div>
      <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-champagne">{heldLabel}</p>
    </footer>
  );
}

// ── Panel / PanelHead / PanelRow — the cockpit + list anatomy (reference .card/.chead/
// .rows): a bone card, a starred head (the domain star marks what it is; the body stays
// bone), and hairline-divided rows. The row grid is caller-set via `cols`. ──
export function Panel({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <div id={id} className={cx("overflow-hidden rounded-[var(--radius)] border border-hairline-token bg-surface-card", className)}>{children}</div>;
}
export function PanelHead({ star, title, meta }: { star?: ReactNode; title: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-hairline-token px-[18px] py-4">
      <span className="flex items-center gap-2 font-display text-[18px] leading-none text-text-primary">{star}{title}</span>
      {meta ? <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-text-meta">{meta}</span> : null}
    </div>
  );
}
// The studio-surface title band (§3): a slim charcoal, full-bleed band — kicker (champagne)
// + Playfair bone title, an optional champagne accent line and a right-side action. Bone
// room follows below. One per page; secondary section headers stay bone (SectionTitle).
export function StudioTitleBand({ kicker, title, accent, action, className }: { kicker?: ReactNode; title: ReactNode; accent?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cx("relative left-1/2 -mt-8 mb-7 w-screen -translate-x-1/2 bg-surface-chrome text-bone", className)}>
      <div className="mx-auto flex max-w-[1240px] items-end justify-between gap-4 px-8 py-7 md:px-10">
        <div>
          {kicker ? <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.24em] text-champagne">{kicker}</p> : null}
          <h1 className="font-display text-[26px] leading-none text-bone">{title}</h1>
          {accent ? <p className="mt-1.5 font-accent text-[15px] italic text-champagne">{accent}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </section>
  );
}

export function PanelRow({ children, href, cols, className }: { children: ReactNode; href?: string; cols?: string; className?: string }) {
  // The last-row exception must sit on the element that actually varies within the Panel:
  // an unlinked row IS the direct child (last:), a linked row's inner div is always the
  // only child of its Link, so the Link carries it (last:[&>div]). This keeps a hairline
  // between every row and none under the last, in both linked and unlinked lists.
  const inner = (
    <div style={cols ? { gridTemplateColumns: cols } : undefined}
      className={cx("grid items-center gap-3.5 border-b border-hairline-token px-[18px] py-3 text-[13px]", !href && "last:border-b-0", className)}>
      {children}
    </div>
  );
  return href ? <Link href={href} className="block transition-colors last:[&>div]:border-b-0 hover:bg-[rgba(17,17,17,0.03)]">{inner}</Link> : inner;
}

// ── DomainHeadCard — the ONE sanctioned domain field (color-roles law): a domain may tint
// its card HEADER, a single title strip (the money radar wears a teal head), while the body
// stays bone for the reading. Bone title + bone star + bone-alpha meta on the strip; never
// tint the body, never two accents. money=teal, time=champagne (ink type), people=taupe. ──
const STRIP: Record<Domain, { bg: string; on: string; star: string; border: string; meta: string }> = {
  money: { bg: "bg-teal", on: "text-bone", star: "#F5F2EB", border: "border-teal", meta: "text-bone/75" },
  time: { bg: "bg-champagne", on: "text-text-primary", star: "#111111", border: "border-champagne", meta: "text-text-primary/60" },
  people: { bg: "bg-taupe", on: "text-bone", star: "#F5F2EB", border: "border-taupe", meta: "text-bone/75" },
};
export function DomainHeadCard({ domain, title, meta, children, className, id }: {
  domain: Domain; title: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; id?: string;
}) {
  const s = STRIP[domain];
  return (
    <div id={id} className={cx("overflow-hidden rounded-[var(--radius)] border bg-surface-card", s.border, className)}>
      <div className={cx("flex items-center justify-between gap-3 px-[18px] py-4", s.bg)}>
        <span className={cx("flex items-center gap-2 font-display text-[18px] leading-none", s.on)}>
          <DomainStar fill={s.star} size={11} />{title}
        </span>
        {meta ? <span className={cx("text-[11px] uppercase tracking-[0.14em]", s.meta)}>{meta}</span> : null}
      </div>
      <div className="p-[18px]">{children}</div>
    </div>
  );
}

/** The flat charcoal hero BAND (Edition One): no radius, no shadow. Champagne kicker,
    Playfair bone heading, stat row on a bone-alpha hairline. Same API. (Full-viewport
    bleed and the in-band event bar/sub-nav arrive with the page milestones.) */
export function HeroShell({
  monogram,
  title,
  eyebrow,
  facts,
}: {
  monogram?: string;
  title?: ReactNode;
  eyebrow?: ReactNode;
  facts?: ReactNode;
}) {
  return (
    <section className="bg-surface-chrome px-8 py-9 text-bone">
      <div className="flex items-start gap-5">
        {monogram ? <Monogram initials={monogram} size={56} dark /> : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="font-accent text-[16px] text-champagne">{eyebrow}</p> : null}
          {title ? <h1 className="mt-1 font-display text-[34px] leading-tight text-bone">{title}</h1> : null}
        </div>
      </div>
      {facts ? <div className="mt-7 flex flex-wrap gap-x-12 gap-y-4 border-t border-hairline-dark pt-5">{facts}</div> : null}
    </section>
  );
}

/** Wedding-level nav bar shell — hairline underline, no container border. */
export function WeddingNav({ items, className }: { items: ReactNode; className?: string }) {
  return (
    <nav className={cx("flex items-center gap-7 pb-3 text-[14px] text-text-meta [box-shadow:inset_0_-1px_0_var(--color-hairline-token)]", className)}>
      {items}
    </nav>
  );
}

/** Event switcher strip + event sub-nav shell (empty for M0). */
export function EventBar({ chips, subnav }: { chips?: ReactNode; subnav?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {chips ? <div className="flex items-center gap-2 overflow-x-auto">{chips}</div> : null}
      {subnav ? (
        <nav className="flex items-center gap-6 pb-2 text-[13.5px] text-text-meta [box-shadow:inset_0_-1px_0_var(--color-hairline-token)]">
          {subnav}
        </nav>
      ) : null}
    </div>
  );
}

/** Reference row of event chips (M1 wires real events). */
export function EventChips({ labels, activeIndex = 0 }: { labels: string[]; activeIndex?: number }) {
  return (
    <>
      {labels.map((l, i) => (
        <Chip key={i} active={i === activeIndex}>
          {l}
        </Chip>
      ))}
    </>
  );
}
