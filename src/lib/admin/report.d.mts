export type ReportResult = {
  gross: number; refunds: number; fees: number; netRevenue: number; commissionsAccrued: number;
  payoutsRecorded: number; expensesByCategory: Record<string, number>; expensesTotal: number; net: number;
  perPartnerAnnual: Record<string, number>;
  referralCreditsAccrued: number; referralRedemptionsBill: number; referralRedemptionsCash: number;
};
export type ReportBounds = { startIso: string; endIso: string; yearStartIso?: string; yearEndIso?: string };
export type ReportData = {
  payments?: Record<string, unknown>[]; refunds?: Record<string, unknown>[]; commissions?: Record<string, unknown>[];
  payouts?: Record<string, unknown>[]; expenses?: Record<string, unknown>[];
  referralCredits?: Record<string, unknown>[]; referralRedemptions?: Record<string, unknown>[];
};

export function inRange(iso: string | null | undefined, startIso: string, endIso: string): boolean;
export function computeReport(bounds: ReportBounds, data: ReportData): ReportResult;
export function periodBounds(kind: string, value: string): { startIso: string; endIso: string; yearStartIso: string; yearEndIso: string };
