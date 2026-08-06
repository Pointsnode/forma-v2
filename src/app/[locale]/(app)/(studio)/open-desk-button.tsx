"use client";

// The cockpit concierge card's "Open the desk" action. The desk is the floating
// ConciergeBubble (its own open state); this dispatches a window event it listens for,
// so the card can open the desk without owning its state. No route, no fabricated data.
export function OpenDeskButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("forma:open-concierge"))}
      className="inline-flex items-center justify-center rounded-[var(--radius)] bg-wine px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-bone transition-opacity hover:opacity-90"
    >
      {label}
    </button>
  );
}
