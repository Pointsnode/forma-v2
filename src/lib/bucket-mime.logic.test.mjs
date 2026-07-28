import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WEDDING_DOCS_MIMES, DESIGN_MEDIA_MIMES, PLANNER_PROFILES_MIMES } from "./bucket-mime.mjs";

// Every bucket's declared allowed_mime_types must equal its shared constant, so
// the code and the bucket can never drift (the M5 text/html-vs-pdf class of bug).
function sqlMimes(file) {
  const sql = readFileSync(new URL(`../../supabase/storage/${file}`, import.meta.url).pathname, "utf8");
  const m = sql.match(/array\[([^\]]+)\]/i);
  assert.ok(m, `no allowed_mime_types array in ${file}`);
  return m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
}

assert.deepEqual(new Set(sqlMimes("wedding-docs.sql")), new Set(WEDDING_DOCS_MIMES), "wedding-docs bucket mimes != constant");
assert.deepEqual(new Set(sqlMimes("design-media.sql")), new Set(DESIGN_MEDIA_MIMES), "design-media bucket mimes != constant");
assert.deepEqual(new Set(sqlMimes("planner-profiles.sql")), new Set(PLANNER_PROFILES_MIMES), "planner-profiles bucket mimes != constant");

console.log("bucket-mime: wedding-docs, design-media & planner-profiles SQL agree with the constants");
