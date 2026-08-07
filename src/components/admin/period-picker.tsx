"use client";

import { useRouter, usePathname } from "next/navigation";

// Period picker → ?kind=month|quarter|year&v=<value>. Server reads the params and computes bounds.
export function PeriodPicker({ kind, value }: { kind: string; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (k: string, v: string) => router.push(`${pathname}?kind=${k}&v=${v}`);
  const sel = "rounded-[var(--radius)] border border-hairline-token bg-surface-card px-2.5 py-1.5 text-[13px] text-ink outline-none";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={kind} onChange={(e) => go(e.target.value, value)} className={sel}>
        <option value="month">Month</option>
        <option value="quarter">Quarter</option>
        <option value="year">Year</option>
      </select>
      {kind === "month" ? (
        <input type="month" value={value} onChange={(e) => go("month", e.target.value)} className={sel} />
      ) : kind === "year" ? (
        <input type="number" value={value} min="2020" max="2100" onChange={(e) => go("year", e.target.value)} className={`${sel} w-24`} />
      ) : (
        <input value={value} onChange={(e) => go("quarter", e.target.value)} placeholder="2026-Q3" className={`${sel} w-28`} />
      )}
    </div>
  );
}
