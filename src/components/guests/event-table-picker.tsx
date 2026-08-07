"use client";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

// §2 — one page-level picker (a refinement over the mock's per-row columns): choosing an event
// swaps in that event's Seat + Plate view (the shared EventGuestTable) for the whole list.
export function EventTablePicker({ events, value }: { events: { id: string; label: string }[]; value: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("guests");
  return (
    <label className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-meta">
      {t("pickEvent")}
      <select
        value={value ?? ""}
        onChange={(e) => router.replace(e.target.value ? `${pathname}?event=${e.target.value}` : pathname)}
        className="rounded-[var(--radius)] border border-hairline-token bg-surface-card px-2.5 py-1.5 text-[12.5px] normal-case tracking-normal text-text-primary"
      >
        <option value="">{t("pickEventNone")}</option>
        {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
      </select>
    </label>
  );
}
