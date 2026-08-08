import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { creditCustomerBalance } from "@/lib/stripe";

// REF-2 bill settlement: push a Stripe customer-balance credit to the REFERRER's customer so it
// reduces their next Forma invoice. Service-role because the customer id lives on workspace_
// subscriptions (owner-only SELECT, not admin-readable via RLS). Returns the Stripe credit id
// (the redemption reference), or null if there's no customer or Stripe is unconfigured — in which
// case the owner can't bill-settle (and the action says so), like the coupon being inert.
export async function applyBillCredit(workspaceId: string, amountCents: number): Promise<string | null> {
  if (!workspaceId || amountCents <= 0) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("workspace_subscriptions").select("stripe_customer_id").eq("workspace_id", workspaceId).maybeSingle();
  const customerId = (data?.stripe_customer_id as string | null) ?? null;
  if (!customerId) return null;
  const res = await creditCustomerBalance(customerId, amountCents, "Forma referral credit");
  return res?.id ?? null;
}
