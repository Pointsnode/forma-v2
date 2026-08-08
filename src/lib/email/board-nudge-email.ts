import "server-only";
import { getTranslations } from "next-intl/server";
import { emailShell, emailButton } from "./shell";
import type { Email } from "./resend";

const FROM = "Forma <messages@forma.events>";

// The client-lane nudge: when a planner replies in the couple's Messages thread, the couple (who
// is not watching the rail) gets one branded email pointing back to their portal. Debounced to one
// per wedding per hour upstream (board_client_nudge). Fully in the wedding's language via the
// email.board.* namespace (L3 — no fallback). Tracking stays off.
export async function boardNudgeEmail(opts: { to: string[]; url: string; locale: string }): Promise<Email> {
  const t = await getTranslations({ locale: opts.locale, namespace: "email" });
  const line = t("board.nudgeLine");
  return {
    from: FROM,
    to: opts.to,
    subject: t("board.nudgeSubject"),
    html: emailShell(
      `<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin-top:16px">${line}</p>${emailButton(opts.url, t("board.nudgeButton"))}`,
      t("shell.held"),
    ),
    text: `${line}\n${opts.url}`,
  };
}
