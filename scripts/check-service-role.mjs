#!/usr/bin/env node
// The service-role (admin) key / client may only appear in explicitly
// allowlisted server files. M0 uses none — the allowlist is empty.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
// The admin (service-role) client + the one route that uses it (the touchpoint cron).
const ALLOWLIST = new Set([
  "src/lib/supabase/admin.ts",
  "src/app/api/touchpoints/run/route.ts",
  "src/app/api/stripe/webhook/route.ts",
  "src/app/[locale]/sign/[token]/actions.ts",
  // M10: the public directory's reads go through the service-role admin client +
  // the public_planner_* DEFINER fns (granted to service_role only, never anon).
  "src/lib/directory.ts",
  // M11: the Calendly webhook has no session — it verifies the signature then writes
  // the meeting via service-role (Stripe-webhook precedent).
  "src/app/api/calendly/webhook/route.ts",
  // M3: the design-comment couple notification reads couple auth-emails (not RLS-readable)
  // + the image via service-role, then sends. Isolated to this one module; fires only for a
  // planner comment; no anon surface, no matrix change.
  "src/lib/design-notify.ts",
  // L3: the lead-automation sweep. Service-role to evaluate rules + read the workspace
  // creator's auth email across workspaces (no session). Isolated to this one lib; invoked
  // only by /api/leads/sweep (CRON_SECRET-guarded). No anon surface, matrix unchanged at 12.
  "src/lib/leads-sweep.ts",
  // Studio logo: signs the private vendor-media logo for the anon /quote/[token] head
  // (the viewer can't sign it themselves). Signing only, one low-sensitivity asset,
  // callers pass their own workspace path. No anon function grant, matrix unchanged.
  "src/lib/studio-logo.ts",
  // REF-2: the referral bill-credit lane reads the referrer's stripe_customer_id (owner-only on
  // workspace_subscriptions, not admin-readable) and pushes a Stripe customer-balance credit.
  // Isolated to this one lib; called only from the owner-gated settle action. No anon surface.
  "src/lib/referral-credit.ts",
]);
const PATTERNS = [/SUPABASE_SERVICE_ROLE_KEY/, /createAdminClient/];
function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|js|mjs)$/.test(e)) yield p;
  }
}
const failures = [];
for (const f of walk(SRC)) {
  const rel = relative(ROOT, f);
  if (ALLOWLIST.has(rel)) continue;
  const c = readFileSync(f, "utf8");
  for (const p of PATTERNS) if (p.test(c)) failures.push(`${rel}: matches ${p}`);
}
if (failures.length) {
  console.error("service-role allowlist violation:\n" + failures.join("\n"));
  process.exit(1);
}
console.log("service-role allowlist: OK");
