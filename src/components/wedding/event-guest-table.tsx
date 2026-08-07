import { getTranslations } from "next-intl/server";
import { Panel, PanelHead, Chip, DomainStar } from "@/components/ui";
import { PlateGlyph, type GlyphVariant } from "./plate-glyph";
import { plateVariant, plateCounts } from "@/lib/plate.mjs";
import type { PlateOption, TableGuest } from "@/lib/event-table";

// §2 — the guest list that answers "where are they and what are they eating." Guest · RSVP ·
// Seat · Plate, scoped to one event. Dietary note + "not chosen" use the danger token (wine on
// bone, legible bone on night); the glyph is the plate.
export async function EventGuestTable({ eventName, options, guests }: { eventName: string; options: PlateOption[]; guests: TableGuest[] }) {
  const t = await getTranslations("guests");
  const optOf = (id: string) => options.find((o) => o.id === id);
  const yes = guests.filter((g) => g.rsvp === "yes").length;
  const pending = guests.filter((g) => g.rsvp === "pending").length;
  const counts = plateCounts(guests, (id: string) => optOf(id)?.letter ?? "");
  const platesLine = [
    ...options.map((o) => `${counts.byLetter[o.letter] ?? 0}${o.letter}`),
    counts.unchosen ? t("platesUnchosen", { n: counts.unchosen }) : null,
  ].filter(Boolean).join(" · ");
  const cols = "grid grid-cols-[1.4fr_90px_150px_1fr] items-center gap-3.5";

  return (
    <Panel>
      <PanelHead
        star={<DomainStar domain="people" size={12} />}
        title={t("tableTitle", { event: eventName })}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Chip tone="settled">{t("yesCount", { n: yes })}</Chip>
            <Chip tone="pending">{t("pendingCount", { n: pending })}</Chip>
            {options.length ? <span className="text-[11px] text-text-meta">{t("platesLabel")}: <span className="lowercase">{platesLine}</span></span> : null}
          </span>
        }
      />
      <div className={`${cols} border-b border-hairline-token px-[18px] py-2 text-[10px] uppercase tracking-[0.16em] text-text-meta`}>
        <span>{t("colGuest")}</span><span>{t("colRsvp")}</span><span>{t("colSeat")}</span><span>{t("colPlate")}</span>
      </div>
      {guests.length === 0 ? (
        <p className="px-[18px] py-8 text-center font-accent text-[15px] text-text-meta">{t("tableEmpty")}</p>
      ) : guests.map((g) => {
        const opt = g.choiceId ? optOf(g.choiceId) : null;
        return (
          <div key={g.guestId} className={`${cols} border-b border-hairline-token px-[18px] py-2.5 text-[13px] last:border-b-0`}>
            <span className="truncate text-text-primary">{g.name}</span>
            <span>
              {g.rsvp === "yes" ? <Chip tone="settled">{t("rsvpYes")}</Chip>
                : g.rsvp === "no" ? <span className="text-[11px] text-text-meta">{t("rsvpNo")}</span>
                  : <Chip tone="pending">{g.rsvp === "maybe" ? t("rsvpMaybe") : t("rsvpPending")}</Chip>}
            </span>
            <span className="tabular-nums text-[12.5px]">
              {g.tableName != null && g.seatNo != null ? <span className="text-text-primary">{g.tableName} · {g.seatNo + 1}</span> : <span className="text-text-meta">· {t("notSeated")}</span>}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-[12.5px]">
              {opt ? (
                <>
                  <PlateGlyph letter={opt.letter} variant={plateVariant(g.choiceId, g.dietary) as GlyphVariant} size={20} />
                  <span className="text-text-primary">{opt.label}</span>
                  {g.dietary ? <span className="text-[11px] text-[color:var(--color-text-danger)]">{g.dietary}</span> : null}
                </>
              ) : g.rsvp === "yes" ? (
                <span className="text-[12px] text-[color:var(--color-text-danger)]">{t("notChosen")}</span>
              ) : <span className="text-text-meta">·</span>}
            </span>
          </div>
        );
      })}
    </Panel>
  );
}
