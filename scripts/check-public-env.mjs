#!/usr/bin/env node
// No secret may be exposed through a NEXT_PUBLIC_ variable.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|js|mjs)$/.test(e)) yield p;
  }
}
const bad = [];
for (const f of walk(SRC)) {
  const c = readFileSync(f, "utf8");
  for (const v of c.match(/NEXT_PUBLIC_[A-Z0-9_]+/g) || []) {
    // RESEND (email), CRON, and STRIPE SECRET/WEBHOOK are server-only, like the
    // service-role key. The Supabase anon key and the Stripe PUBLISHABLE key are
    // public-by-design — the only NEXT_PUBLIC_*_KEY names allowed.
    const PUBLIC_OK = new Set(["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]);
    if (/SERVICE_ROLE|SECRET|WEBHOOK|PRIVATE|PASSWORD|RESEND|CRON|_KEY$/.test(v) && !PUBLIC_OK.has(v)) {
      bad.push(`${relative(ROOT, f)}: ${v}`);
    }
  }
}
if (bad.length) {
  console.error("public env leak:\n" + bad.join("\n"));
  process.exit(1);
}
console.log("public env check: OK");
