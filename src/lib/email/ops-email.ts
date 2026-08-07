import "server-only";
import { getTranslations } from "next-intl/server";
import { emailShell, emailButton } from "./shell";
import type { Email } from "./resend";

const FROM = "Forma <rsvp@forma.events>";

// menu_collect, a tokenized link to /menu/[code]. Recipient's language via email.* (no fallback).
export async function menuEmail(opts: { to: string; guestName: string; couple: string; menuUrl: string; locale: string }): Promise<Email> {
  const t = await getTranslations({ locale: opts.locale, namespace: "email" });
  const line = t("ops.menuLine", { name: opts.guestName, couple: opts.couple });
  return {
    from: FROM, to: [opts.to], subject: t("ops.menuSubject", { couple: opts.couple }),
    html: emailShell(`<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:16px">${line}</p>${emailButton(opts.menuUrl, t("ops.menuButton"))}`, t("shell.held")),
    text: `${line}\n${opts.menuUrl}`,
  };
}

// day_of_schedule, a read-only itinerary email (no page): events, times, venue, seat.
export async function dayOfScheduleEmail(opts: { to: string; guestName: string; couple: string; events: { label: string; date: string | null; time: string | null; venue: string | null }[]; seat: string | null; locale: string }): Promise<Email> {
  const t = await getTranslations({ locale: opts.locale, namespace: "email" });
  const rows = opts.events.map((e) => `<tr><td style="padding:6px 14px 6px 0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;color:#7A6A50">${[e.date, e.time].filter(Boolean).join(" · ") || ""}</td><td style="padding:6px 0"><b>${e.label}</b>${e.venue ? `<br><span style="font-size:12px;color:#8A867E">${e.venue}</span>` : ""}</td></tr>`).join("");
  const seatLine = opts.seat ? `<p style="font-family:Inter,Arial,sans-serif;font-size:14px;margin-top:12px">${t("ops.scheduleSeat")}: <b>${opts.seat}</b></p>` : "";
  return {
    from: FROM, to: [opts.to], subject: t("ops.scheduleSubject", { couple: opts.couple }),
    html: emailShell(`<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:16px">${t("ops.scheduleGreeting", { name: opts.guestName })}</p><table style="margin-top:10px">${rows}</table>${seatLine}`, t("shell.held")),
    text: `${opts.couple}\n${opts.events.map((e) => `${[e.date, e.time].filter(Boolean).join(" ")} · ${e.label}`).join("\n")}${opts.seat ? `\nSeat: ${opts.seat}` : ""}`,
  };
}
