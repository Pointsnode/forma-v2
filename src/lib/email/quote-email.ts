import "server-only";
import { getTranslations } from "next-intl/server";
import { emailShell, emailButton } from "./shell";
import type { Email } from "./resend";

const FROM = "Forma <quotes@forma.events>";

// The quote-link email, fully in the recipient's language via the email.* namespace (L3).
export async function quoteEmail(opts: { to: string; coupleName: string; quoteUrl: string; locale: string }): Promise<Email> {
  const t = await getTranslations({ locale: opts.locale, namespace: "email" });
  const line = t("quote.line", { couple: opts.coupleName });
  const html = emailShell(
    `<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:0">${line}</p>${emailButton(opts.quoteUrl, t("quote.button"))}`,
    t("shell.held"),
  );
  return { from: FROM, to: [opts.to], subject: t("quote.subject", { couple: opts.coupleName }), html, text: `${line}\n${opts.quoteUrl}` };
}
