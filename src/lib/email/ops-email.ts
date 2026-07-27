import "server-only";

type Email = { from: string; to: string[]; subject: string; html: string; text: string };
const FROM = "Forma <rsvp@forma.events>";

function shell(body: string): string {
  return `<div style="font-family:Georgia,serif;color:#121212;background:#F7F4EE;padding:28px"><div style="font-size:22px;letter-spacing:.04em">forma</div>${body}</div>`;
}
function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:14px;background:#121212;color:#F7F4EE;text-decoration:none;padding:11px 22px;border-radius:99px;font-family:Inter,Arial,sans-serif;font-size:14px">${label}</a>`;
}

// menu_collect — a tokenized link to /menu/[code], the RSVP pattern.
export function menuEmail(opts: { to: string; guestName: string; couple: string; menuUrl: string; locale: string }): Email {
  const es = opts.locale === "es";
  const line = es
    ? `Hola ${opts.guestName}: elige tu plato para ${opts.couple}. Puedes cambiarlo hasta que cerremos el menú.`
    : `Hi ${opts.guestName} — choose your plate for ${opts.couple}. You can change it until we close the menu.`;
  return {
    from: FROM, to: [opts.to], subject: es ? `Elige tu menú — ${opts.couple}` : `Choose your menu — ${opts.couple}`,
    html: shell(`<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:16px">${line}</p>${button(opts.menuUrl, es ? "Elegir mi plato" : "Choose my plate")}`),
    text: `${line}\n${opts.menuUrl}`,
  };
}

// day_of_schedule — a read-only itinerary email (no page): the guest's events,
// times, venue, and their seat.
export function dayOfScheduleEmail(opts: { to: string; guestName: string; couple: string; events: { label: string; date: string | null; time: string | null; venue: string | null }[]; seat: string | null; locale: string }): Email {
  const es = opts.locale === "es";
  const rows = opts.events.map((e) => `<tr><td style="padding:6px 14px 6px 0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;color:#7A6A50">${[e.date, e.time].filter(Boolean).join(" · ") || ""}</td><td style="padding:6px 0"><b>${e.label}</b>${e.venue ? `<br><span style="font-size:12px;color:#8A867E">${e.venue}</span>` : ""}</td></tr>`).join("");
  const seatLine = opts.seat ? `<p style="font-family:Inter,Arial,sans-serif;font-size:14px;margin-top:12px">${es ? "Tu lugar" : "Your seat"}: <b>${opts.seat}</b></p>` : "";
  return {
    from: FROM, to: [opts.to], subject: es ? `Tu itinerario — ${opts.couple}` : `Your schedule — ${opts.couple}`,
    html: shell(`<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:16px">${es ? `Hola ${opts.guestName}, aquí están tus días.` : `Hi ${opts.guestName}, here are your days.`}</p><table style="margin-top:10px">${rows}</table>${seatLine}`),
    text: `${opts.couple}\n${opts.events.map((e) => `${[e.date, e.time].filter(Boolean).join(" ")} — ${e.label}`).join("\n")}${opts.seat ? `\nSeat: ${opts.seat}` : ""}`,
  };
}
