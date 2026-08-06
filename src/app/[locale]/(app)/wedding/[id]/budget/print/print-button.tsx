"use client";

// Print-to-PDF trigger for the budget export. Hidden in the printed output (print:hidden).
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-[var(--radius)] bg-wine px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-bone print:hidden"
    >
      {label}
    </button>
  );
}
