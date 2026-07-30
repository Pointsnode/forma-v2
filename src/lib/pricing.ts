// Single source of truth for seat pricing (USD/month) — shared by the M15 /team seat
// panel and the M12 landing pricing panel so the two can never drift. Gio's M15
// numbers: $79 the admin (founding) account · $49 each additional account · $15 per
// account with the Concierge box. (Supersedes the landing's earlier $59 additional.)
export const PRICE_ADMIN = 79;
export const PRICE_ADDITIONAL = 49;
export const PRICE_CONCIERGE = 15;

// Compute the monthly seat bill from real counts. `accounts` is every workspace
// member (the admin included); `conciergeSeats` is how many have the concierge box.
export function seatBill(accounts: number, conciergeSeats: number): { accounts: number; additional: number; conciergeSeats: number; total: number } {
  const additional = Math.max(0, accounts - 1);
  return {
    accounts,
    additional,
    conciergeSeats,
    total: PRICE_ADMIN + PRICE_ADDITIONAL * additional + PRICE_CONCIERGE * conciergeSeats,
  };
}
