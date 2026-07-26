#!/usr/bin/env node
// Hermetic tests must scope assertions to fixture rows — no unscoped global
// count(*) — so they stay deterministic and never assert against a whole table.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname;
const dir = join(ROOT, "supabase/tests");
const bad = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
  const sql = readFileSync(join(dir, f), "utf8");
  const re = /count\(\*\)\s+from\s+(?:public\.)?\w+(?![^;]*\bwhere\b)/gi;
  let m;
  while ((m = re.exec(sql))) bad.push(`${f}: unscoped ${m[0].replace(/\s+/g, " ")}`);
}
if (bad.length) {
  console.error("test scoping violations:\n" + bad.join("\n"));
  process.exit(1);
}
console.log("test scoping: OK");
