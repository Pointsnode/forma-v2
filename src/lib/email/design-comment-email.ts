import "server-only";
import { emailShell, emailButton } from "./shell";

type Email = { from: string; to: string[]; subject: string; html: string; text: string };
const FROM = "Forma <studio@forma.events>";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The couple's notification when the planner leaves a design note. EN/ES inline; FR/IT
// fall back to EN until the email catalog namespace lands (the documented gap). The image
// is inlined (a long-lived signed URL) and the CTA opens the studio in the wedding's locale.
export function commentEmail(opts: { to: string; couple: string; planner: string; imageUrl: string | null; studioUrl: string; body: string; locale: string }): Email {
  const es = opts.locale === "es";
  const subject = es ? `Una nota sobre tu diseño · ${opts.couple}` : `A note on your design · ${opts.couple}`;
  const lead = es ? `${opts.planner} dejó una nota en tu estudio de diseño.` : `${opts.planner} left a note on your design studio.`;
  const cta = es ? "Abrir el estudio" : "Open the studio";
  const img = opts.imageUrl ? `<img src="${opts.imageUrl}" alt="" style="max-width:100%;border-radius:4px;margin:14px 0" />` : "";
  const html = emailShell(
    `<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:0">${esc(lead)}</p>${img}
    <p style="font-size:15px;font-style:italic;color:#3B3833">&ldquo;${esc(opts.body)}&rdquo;</p>
    ${emailButton(opts.studioUrl, cta)}`,
    opts.locale,
  );
  return { from: FROM, to: [opts.to], subject, html, text: `${lead}\n\n"${opts.body}"\n\n${cta}: ${opts.studioUrl}` };
}
