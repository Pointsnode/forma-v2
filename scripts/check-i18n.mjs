#!/usr/bin/env node
// i18n integrity guard. Two invariants:
//   1. Every locale file mirrors en's key set exactly (no missing/extra keys).
//   2. es.json carries its diacritics — the file must contain non-ASCII bytes.
// (2) is the canary for the M0 defect: a write that ASCII-strips Spanish
// ("sesión" -> "sesion") makes the file pure ASCII and fails CI here, so it
// cannot silently recur in M1+.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const dir = join(ROOT, "messages");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

const load = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
const keysOf = (o, p = "") =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? keysOf(v, `${p}${k}.`) : [`${p}${k}`],
  );

let failed = 0;
const fail = (m) => {
  console.error(`i18n: ${m}`);
  failed++;
};

const BASE = "en.json";
if (!files.includes(BASE)) fail(`missing base locale ${BASE}`);
const baseKeys = new Set(keysOf(load(BASE)));

for (const f of files) {
  if (f === BASE) continue;
  const keys = new Set(keysOf(load(f)));
  for (const k of baseKeys) if (!keys.has(k)) fail(`${f} missing key ${k}`);
  for (const k of keys) if (!baseKeys.has(k)) fail(`${f} has extra key ${k}`);
}

// Spanish must not be ASCII-stripped (á é í ó ú ñ ü and ¿ ¡).
if (files.includes("es.json")) {
  const raw = readFileSync(join(dir, "es.json"));
  if (!raw.some((b) => b > 127)) fail("es.json is pure ASCII — diacritics were stripped");
}

if (failed) process.exit(1);
console.log(`i18n: ${files.length} locale files, keys aligned, es diacritics present`);
