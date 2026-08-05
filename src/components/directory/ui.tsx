import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cx } from "@/components/ui/cn";
import { publicImageUrl, pick, type DirectoryCard } from "@/lib/directory-shared";
import type { Locale } from "@/i18n/routing";

// Public directory chrome — the brand's editorial-luxury face (display serif on
// bone/paper, photography-led). Deliberately NOT the admin studio shell: no nav,
// no cards-on-shadow; full-bleed imagery and generous serif type.

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export function PublicHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
      <Link href="/planners" className="leading-none">
        <span className="font-display text-[24px] tracking-[0.04em] text-ink">forma</span>
      </Link>
      <span className="text-[10px] uppercase tracking-[0.34em] text-taupe">The wedding planner directory</span>
    </header>
  );
}

export function PublicFooter({ note }: { note: string }) {
  return (
    <footer className="mx-auto max-w-6xl px-6 py-16 text-center">
      <div className="mx-auto mb-4 h-px w-16 bg-hairline" />
      <p className="font-accent text-[16px] italic text-taupe">{note}</p>
      <p className="mt-2 font-display text-[20px] tracking-[0.04em] text-ink">forma</p>
    </footer>
  );
}

/** Photograph in a fixed editorial frame; a duotone serif-monogram block when the
    path resolves to no object (graceful, never a broken image). */
export function PhotoFrame({
  path,
  alt,
  initials,
  className,
  sizes = "100vw",
  priority = false,
}: {
  path?: string | null;
  alt: string;
  initials: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const url = publicImageUrl(path);
  return (
    <div className={cx("relative overflow-hidden bg-bone", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} sizes={sizes} loading={priority ? "eager" : "lazy"} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(135deg,var(--color-bone),var(--color-champagne))]">
          <span className="font-accent text-[15%] italic leading-none text-taupe/70">{initials}</span>
        </div>
      )}
    </div>
  );
}

export function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "·";
}

export function PlannerCard({ card, locale }: { card: DirectoryCard; locale: Locale }) {
  const regions = [...new Set(card.areas.map((a) => a.region))].slice(0, 3).join(" · ");
  return (
    <Link href={`/p/${card.slug}`} className="group block">
      <PhotoFrame
        path={card.profile.hero}
        alt={card.name}
        initials={toInitials(card.name)}
        className="aspect-[4/5] w-full rounded-[var(--radius)]"
        sizes="(max-width: 768px) 100vw, 33vw"
      />
      <div className="mt-3.5">
        <h3 className="font-display text-[21px] leading-snug text-ink">{card.name}</h3>
        <p className="mt-0.5 font-accent text-[16px] italic leading-snug text-taupe line-clamp-2">{pick(card.profile.tagline, locale)}</p>
        {regions ? <p className="mt-1.5 text-[11px] uppercase tracking-[0.16em] text-muted">{regions}</p> : null}
      </div>
    </Link>
  );
}

export function SectionKicker({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-taupe">{children}</p>;
}
