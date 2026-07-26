#!/usr/bin/env node
// The service-role (admin) key / client may only appear in explicitly
// allowlisted server files. M0 uses none — the allowlist is empty.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const ALLOWLIST = new Set([]);
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
