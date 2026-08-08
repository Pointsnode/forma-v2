export const REFERRAL_CREDIT_CENTS: number;
export const REFERRAL_INVOICES: number;
export const REFERRAL_CASH_THRESHOLD_CENTS: number;
export const REFERRAL_COOKIE: string;
export const REFERRAL_COOKIE_DAYS: number;

export function countMaturedInvoices(invoices: { amount_paid_cents: number | null; fully_refunded: boolean }[] | null | undefined): number;
export function matureDecision(args: { status: string; count: number; threshold: number }): { count: number; matured: boolean; freeze: boolean };
