import "server-only";

// Bilingual, on-brand RSVP emails (ink on bone, serif headline, one button, no
// images). Plain-text alternative included. From `Forma <rsvp@forma.events>`.

type Kind = "rsvp_invite" | "rsvp_reminder" | "rsvp_close";
// locale is any of the four; fr/it gracefully fall back to the EN copy (ES ships today).
// The email catalog namespace that would carry FR/IT bodies is a documented follow-up.
type Args = { to: string; guestName: string; couple: string; rsvpUrl: string; kind: Kind; locale: string };

const COPY = {
  en: {
    rsvp_invite: { subject: (c: string) => `You're invited, ${c}`, lead: (c: string) => `${c} would love to know if you can join them.`, cta: "Respond now" },
    rsvp_reminder: { subject: (c: string) => `A gentle reminder, ${c}`, lead: (c: string) => `We haven't heard from you yet for ${c}. It only takes a moment.`, cta: "Respond now" },
    rsvp_close: { subject: (c: string) => `RSVPs are closing, ${c}`, lead: (c: string) => `The guest list for ${c} is about to close. Last chance to let them know.`, cta: "Respond now" },
    hi: (n: string) => `Dear ${n},`,
    footer: "Sent by Forma on behalf of the couple. One link, no account needed.",
  },
  es: {
    rsvp_invite: { subject: (c: string) => `Estás invitado, ${c}`, lead: (c: string) => `A ${c} le encantaría saber si puedes acompañarles.`, cta: "Responder ahora" },
    rsvp_reminder: { subject: (c: string) => `Un recordatorio, ${c}`, lead: (c: string) => `Aún no tenemos tu respuesta para ${c}. Solo toma un momento.`, cta: "Responder ahora" },
    rsvp_close: { subject: (c: string) => `El RSVP está por cerrar, ${c}`, lead: (c: string) => `La lista de ${c} está por cerrarse. Última oportunidad para avisarles.`, cta: "Responder ahora" },
    hi: (n: string) => `Hola ${n},`,
    footer: "Enviado por Forma en nombre de la pareja. Un enlace, sin cuenta.",
  },
};

export function rsvpEmail({ to, guestName, couple, rsvpUrl, kind, locale }: Args) {
  const t = COPY[locale as keyof typeof COPY] ?? COPY.en;
  const k = t[kind];
  const subject = k.subject(couple);
  const text = `${t.hi(guestName)}\n\n${k.lead(couple)}\n\n${k.cta}: ${rsvpUrl}\n\n${t.footer}`;
  const html = `<!doctype html><html><body style="margin:0;background:#F7F4EE;padding:32px 16px;font-family:Georgia,'Times New Roman',serif;color:#121212">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#FFFDF9;border-radius:16px;padding:36px 32px">
    <tr><td style="font-size:22px;letter-spacing:.02em;color:#121212;font-family:Georgia,'Times New Roman',serif"><span style="font-style:italic">f</span>orma</td></tr>
    <tr><td style="font-size:26px;line-height:1.25;padding:14px 0 6px">${escapeHtml(couple)}</td></tr>
    <tr><td style="font-size:16px;color:#2a2a2a;line-height:1.5;padding-bottom:8px">${escapeHtml(t.hi(guestName))}</td></tr>
    <tr><td style="font-size:16px;color:#2a2a2a;line-height:1.5;padding-bottom:24px">${escapeHtml(k.lead(couple))}</td></tr>
    <tr><td><a href="${rsvpUrl}" style="display:inline-block;background:#121212;color:#F7F4EE;text-decoration:none;padding:12px 28px;border-radius:999px;font-family:Arial,sans-serif;font-size:14px">${escapeHtml(k.cta)}</a></td></tr>
    <tr><td style="font-size:12px;color:#8a867e;padding-top:28px;font-family:Arial,sans-serif">${escapeHtml(t.footer)}</td></tr>
  </table></td></tr></table></body></html>`;
  return { from: "Forma <rsvp@forma.events>", to: [to], subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
