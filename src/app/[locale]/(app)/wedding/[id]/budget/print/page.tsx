import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadLedger } from "@/lib/money";
import { formatMoney, formatDateRange } from "@/lib/wedding";
import { loadDatePrefs } from "@/lib/prefs";
import { formatDate } from "@/lib/format-date";
import { Wordmark } from "@/components/ui";
import { PrintButton } from "./print-button";

// "Export for the couple" — a print-optimized budget in Edition One, rendered in the
// WEDDING's language (wedding.locale, else the viewer's), for browser print-to-PDF. No
// shell chrome; the couple sees the same numbers, always current. Staff + couple only
// (loadWeddingContext gates); no anon.
export default async function BudgetPrint({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, role } = ctx;
  const viewer = await getLocale();
  const wl = (wedding.locale as string | null) ?? viewer;
  const tm = await getTranslations({ locale: wl, namespace: "money" });
  const prefs = await loadDatePrefs(supabase, wl);
  const fmt = (n: string | number | null) => formatMoney(n, wl) ?? "·";

  const { lines, rollup, traceFor } = await loadLedger(supabase, id);
  const range = formatDateRange(wedding.date_start, wedding.date_end, wl);
  const budget = Number(rollup.budget_total ?? 0);
  const lineSum = lines.reduce((s, l) => s + Number(l.amount ?? 0), 0);
  const delta = budget - lineSum;

  return (
    <div className="min-h-screen bg-bone px-8 py-10 text-ink print:px-0 print:py-0">
      <div className="mx-auto max-w-[760px]">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-taupe">{tm("title")}</p>
            <h1 className="mt-1 font-display text-[32px] leading-none text-ink">{wedding.couple_display}</h1>
            {range ? <p className="mt-1.5 font-accent text-[16px] italic text-taupe">{range}</p> : null}
          </div>
          <div className="flex flex-col items-end gap-3">
            <Wordmark size={20} />
            {role === "staff" || role === "member" ? <PrintButton label={tm("exportCouple")} /> : null}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 border-y border-hairline py-4">
          {([["budget", rollup.budget_total], ["committed", rollup.committed], ["paid", rollup.paid]] as const).map(([k, v]) => (
            <div key={k}>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">{tm(k)}</p>
              <p className="mt-1 font-display text-[24px] leading-none text-ink tabular-nums">{fmt(v)}</p>
            </div>
          ))}
        </div>

        <table className="mt-6 w-full text-[13px]">
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-hairline">
                <td className="py-2.5 pr-4">
                  <span className="text-ink">{l.title}</span>
                  {(() => { const tr = traceFor(l)[0]; return tr ? <span className="ml-2 text-[12px] text-taupe">{tr.kind === "quote" ? tm("traceQuote") : tr.label}</span> : null; })()}
                  {l.due_date ? <span className="ml-2 text-[12px] text-muted">· {formatDate(l.due_date, prefs)}</span> : null}
                </td>
                <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-ink">{fmt(l.amount)}</td>
                <td className="whitespace-nowrap py-2.5 pl-4 text-right text-[11px] uppercase tracking-[0.1em] text-muted">{tm(`status_${l.status}`)}</td>
              </tr>
            ))}
            <tr className="bg-ink text-bone">
              <td className="py-3 pl-3 font-medium">{tm("totalLabel")}</td>
              <td className="whitespace-nowrap py-3 text-right tabular-nums font-medium">{fmt(lineSum)}</td>
              <td className="whitespace-nowrap py-3 pr-3 text-right text-[11px] text-champagne">
                {budget > 0 ? (delta >= 0 ? tm("deltaUnder", { amount: fmt(delta) }) : tm("deltaOver", { amount: fmt(-delta) })) : ""}
              </td>
            </tr>
          </tbody>
        </table>

        <p className="mt-4 font-accent text-[14px] italic text-taupe">{tm("computedNote")}</p>
      </div>
    </div>
  );
}
