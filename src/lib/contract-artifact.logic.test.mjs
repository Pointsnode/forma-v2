import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARTIFACT_UPLOAD_MIME, ARTIFACT_ALLOWED_MIMES } from "./contract-artifact-mime.mjs";

// The filing code must upload a content-type the bucket allows — this is the exact
// mismatch (bucket ['application/pdf'] vs upload text/html) that swallowed a real
// filing and let the banner lie.
assert.ok(
  ARTIFACT_ALLOWED_MIMES.includes(ARTIFACT_UPLOAD_MIME),
  `upload mime ${ARTIFACT_UPLOAD_MIME} is not in the allowed set ${JSON.stringify(ARTIFACT_ALLOWED_MIMES)}`,
);

// And the storage bucket SQL's allowed_mime_types must equal the shared constant,
// so the two can never drift apart again.
const sqlPath = new URL("../../supabase/storage/contract-artifacts.sql", import.meta.url).pathname;
const sql = readFileSync(sqlPath, "utf8");
const m = sql.match(/array\[([^\]]+)\]/i);
assert.ok(m, "could not find the allowed_mime_types array in contract-artifacts.sql");
const sqlMimes = m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
assert.deepEqual(
  new Set(sqlMimes), new Set(ARTIFACT_ALLOWED_MIMES),
  `bucket SQL mimes ${JSON.stringify(sqlMimes)} != constant ${JSON.stringify(ARTIFACT_ALLOWED_MIMES)}`,
);

console.log("contract-artifact: bucket allows the uploaded mime; SQL and constant agree");
