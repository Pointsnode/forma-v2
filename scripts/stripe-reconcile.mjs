#!/usr/bin/env node
// ADM-1 Stripe reconcile — READ ONLY. Compares, per calendar month, the succeeded-payment
// COUNT and gross CENTS in the mirror against Stripe (paged charges). Exits nonzero on any
// month mismatch, so it can gate a cutover. Never writes. Run by hand:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... STRIPE_SECRET_KEY=... \
//     node scripts/stripe-reconcile.mjs
import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
  console.error("reconcile: set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY");
  process.exit(2);
}
const db = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const API = "https://api.stripe.com/v1";

async function stripe(path) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } });
  if (!res.ok) throw new Error(`stripe ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
async function* pages(path) {
  let after = null;
  for (;;) {
    const url = `${path}${path.includes("?") ? "&" : "?"}limit=100${after ? `&starting_after=${after}` : ""}`;
    const page = await stripe(url);
    for (const it of page.data) yield it;
    if (!page.has_more || !page.data.length) break;
    after = page.data[page.data.length - 1].id;
  }
}
const bump = (b, m, cents) => { (b[m] ??= { count: 0, cents: 0 }).count++; b[m].cents += cents; };

// Stripe: succeeded, paid charges by month-of-creation.
const stripeB = {};
for await (const ch of pages("/charges")) {
  if (ch.status !== "succeeded" || !ch.paid) continue;
  bump(stripeB, new Date(ch.created * 1000).toISOString().slice(0, 7), ch.amount || 0);
}

// Mirror: succeeded payments by month-of-paid_at.
const mirrorB = {};
const { data: pays, error } = await db.from("billing_payments").select("amount_cents, paid_at, status");
if (error) { console.error("reconcile: mirror read failed:", error.message); process.exit(2); }
for (const p of pays ?? []) {
  if (p.status !== "succeeded" || !p.paid_at) continue;
  bump(mirrorB, String(p.paid_at).slice(0, 7), p.amount_cents || 0);
}

const months = [...new Set([...Object.keys(stripeB), ...Object.keys(mirrorB)])].sort();
let mismatches = 0;
for (const m of months) {
  const s = stripeB[m] ?? { count: 0, cents: 0 };
  const d = mirrorB[m] ?? { count: 0, cents: 0 };
  const ok = s.count === d.count && s.cents === d.cents;
  console.log(`${m}  stripe ${s.count}/${s.cents}  mirror ${d.count}/${d.cents}  ${ok ? "ok" : "MISMATCH"}`);
  if (!ok) mismatches++;
}
if (mismatches) { console.error(`reconcile: ${mismatches} month(s) mismatch`); process.exit(1); }
console.log(`reconcile: mirror matches Stripe across ${months.length} month(s).`);
