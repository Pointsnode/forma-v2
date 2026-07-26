#!/usr/bin/env node
// Runner for pure JS logic tests (*.logic.test.mjs). None in M0 — the runner is
// in place so later milestones inherit it (v1's test:logic pattern).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.logic\.test\.mjs$/.test(e)) yield p;
  }
}
const tests = [...walk(SRC)];
if (tests.length === 0) {
  console.log("logic tests: none yet (runner in place)");
  process.exit(0);
}
let failed = 0;
for (const t of tests) {
  try { await import(t); console.log(`logic ${t} ... ok`); }
  catch (e) { console.error(`logic ${t} ... FAILED\n${e.message}`); failed++; }
}
process.exit(failed ? 1 : 0);
