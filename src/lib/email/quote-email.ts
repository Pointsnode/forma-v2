import "server-only";
import { emailShell, emailButton } from "./shell";

type Email = { from: string; to: string[]; subject: string; html: string; text: string };
const FROM = "Forma <quotes@forma.events>";

// The one minimal quote-link email (L2): subject + one line + a single wine button, through
// the M4 shell. EN/ES inline; FR/IT fall back to EN — the documented email-namespace gap. The
// full composer + the four-language email catalog are L3.
export function quoteEmail(opts: { to: string; coupleName: string; quoteUrl: string; locale: string }): Email {
  const es = opts.locale === "es";
  const subject = es ? `Su cotización, ${opts.coupleName}` : `Your quote, ${opts.coupleName}`;
  const line = es
    ? `Hola ${opts.coupleName}: su cotización está lista. Ábrala cuando quiera.`
    : `Hi ${opts.coupleName}, your quote is ready. Open it whenever you like.`;
  const html = emailShell(
    `<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:0">${line}</p>${emailButton(opts.quoteUrl, es ? "Ver la cotización" : "View the quote")}`,
    opts.locale,
  );
  return { from: FROM, to: [opts.to], subject, html, text: `${line}\n${opts.quoteUrl}` };
}
