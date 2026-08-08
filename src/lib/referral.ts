// TS view of the referral program's numbers — re-exported from referral.mjs (the ONE place, §4,
// so the rebuild script and the app share the same values). Plus the dollar derivations for copy.
export { REFERRAL_CREDIT_CENTS, REFERRAL_INVOICES, REFERRAL_CASH_THRESHOLD_CENTS, REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS } from "@/lib/referral.mjs";
import { REFERRAL_CREDIT_CENTS, REFERRAL_CASH_THRESHOLD_CENTS } from "@/lib/referral.mjs";

export const REFERRAL_CREDIT_DOLLARS = REFERRAL_CREDIT_CENTS / 100;
export const REFERRAL_CASH_THRESHOLD_DOLLARS = REFERRAL_CASH_THRESHOLD_CENTS / 100;
