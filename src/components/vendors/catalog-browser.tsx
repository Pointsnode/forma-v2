"use client";

import { useMemo, useState, useDeferredValue } from "react";
import { useTranslations } from "next-intl";
import { cx } from "@/components/ui";
import type { VendorCard } from "@/lib/vendors";
import { catalogMatches, isInUse, tally } from "@/lib/catalog-filter.mjs";
import { VendorBento } from "./vendor-bento";

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const INPUT = "w-full rounded-[var(--radius)] bg-bone px-3.5 py-2.5 pr-9 text-[14px] text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-champagne";

function ToggleChip({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "rounded-[var(--radius)] px-3 py-1 text-[12.5px] transition",
        active ? "bg-ink text-bone" : "border border-hairline text-muted hover:border-ink hover:text-ink",
      )}
    >
      {label}{count != null ? <span className={cx("ml-1.5", active ? "text-bone/70" : "text-muted")}>{count}</span> : null}
    </button>
  );
}

// §A CatalogBrowser wraps VendorBento: the search + filter bar above, the filtered grid below. All
// filtering is in-memory on the already-loaded cards — instant, no server round-trip. On /venues the
// Kind facet is hidden (every card is a venue); City + engagement apply on both pages.
export function CatalogBrowser({ vendors, mode }: { vendors: VendorCard[]; mode: "vendors" | "venues" }) {
  const t = useTranslations("vendors");
  const [q, setQ] = useState("");
  const [kinds, setKinds] = useState<Set<string>>(new Set());
  const [cities, setCities] = useState<Set<string>>(new Set());
  const [eng, setEng] = useState<"" | "inuse" | "available">("");
  const dq = useDeferredValue(q); // light debounce — the input stays responsive; filtering defers

  const kindFacets = useMemo(() => (mode === "venues" ? [] : tally(vendors, (v: VendorCard) => [v.kind])), [vendors, mode]) as [string, number][];
  const cityFacets = useMemo(() => tally(vendors, (v: VendorCard) => v.cities), [vendors]) as [string, number][];
  const inUseCount = useMemo(() => vendors.filter(isInUse).length, [vendors]);

  const filtered = useMemo(
    () => vendors.filter((v) => catalogMatches(v, { q: dq, kinds: [...kinds], cities: [...cities], eng })),
    [vendors, dq, kinds, cities, eng],
  );

  const active = q !== "" || kinds.size > 0 || cities.size > 0 || eng !== "";
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, val: string) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    setter(next);
  };
  const clearAll = () => { setQ(""); setKinds(new Set()); setCities(new Set()); setEng(""); };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 rounded-[var(--radius)] bg-bone p-4">
        <div className="relative">
          <input className={INPUT} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} />
          {q ? (
            <button type="button" onClick={() => setQ("")} aria-label={t("clearAll")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] leading-none text-muted hover:text-ink">✕</button>
          ) : null}
        </div>

        {kindFacets.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] uppercase tracking-[0.1em] text-muted">{t("facetKind")}</span>
            {kindFacets.map(([k, n]) => (
              <ToggleChip key={k} label={titleCase(k)} count={n} active={kinds.has(k)} onClick={() => toggle(kinds, setKinds, k)} />
            ))}
          </div>
        ) : null}

        {cityFacets.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] uppercase tracking-[0.1em] text-muted">{t("facetCity")}</span>
            {cityFacets.map(([c, n]) => (
              <ToggleChip key={c} label={c} count={n} active={cities.has(c)} onClick={() => toggle(cities, setCities, c)} />
            ))}
          </div>
        ) : null}

        {inUseCount > 0 && inUseCount < vendors.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <ToggleChip label={t("facetInUse")} count={inUseCount} active={eng === "inuse"} onClick={() => setEng(eng === "inuse" ? "" : "inuse")} />
            <ToggleChip label={t("facetAvailable")} count={vendors.length - inUseCount} active={eng === "available"} onClick={() => setEng(eng === "available" ? "" : "available")} />
          </div>
        ) : null}

        {active ? (
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[12.5px] text-muted">{t("countLine", { n: filtered.length, total: vendors.length })}</span>
            <button type="button" onClick={clearAll} className="text-[12.5px] font-medium text-wine hover:underline hover:underline-offset-2">{t("clearAll")}</button>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius)] bg-bone p-10 text-center">
          <p className="font-accent text-[17px] text-muted">{mode === "venues" ? t("filteredEmptyVenues") : t("filteredEmptyVendors")}</p>
          <button type="button" onClick={clearAll} className="mt-3 text-[13px] font-medium text-wine hover:underline hover:underline-offset-2">{t("clearAll")}</button>
        </div>
      ) : (
        <VendorBento vendors={filtered} />
      )}
    </div>
  );
}
