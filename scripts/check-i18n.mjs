#!/usr/bin/env node
// i18n integrity guard. Invariants:
//   1. All FOUR locales exist (en·es·fr·it) — a missing one fails CI.
//   2. Every locale file mirrors en's key set exactly (no missing/extra keys).
//   3. NO em dashes in any catalog (house law; the middot '·' is the empty mark).
//   4. es/fr/it carry their diacritics — the file must contain non-ASCII bytes.
// (4) is the canary for the M0 defect: a write that ASCII-strips a Romance language
// makes the file pure ASCII and fails CI here, so it cannot silently recur.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REQUIRED = ["en", "es", "fr", "it"];
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

// (1) All four required locales must be present.
for (const l of REQUIRED) if (!files.includes(`${l}.json`)) fail(`missing required locale ${l}.json`);

const baseKeys = new Set(keysOf(load(BASE)));

for (const f of files) {
  // (3) No em dashes anywhere in any catalog.
  if (readFileSync(join(dir, f), "utf8").includes("—")) fail(`${f} contains an em dash (—); use the middot ·`);
  if (f === BASE) continue;
  const keys = new Set(keysOf(load(f)));
  for (const k of baseKeys) if (!keys.has(k)) fail(`${f} missing key ${k}`);
  for (const k of keys) if (!baseKeys.has(k)) fail(`${f} has extra key ${k}`);
}

// (4) es/fr/it must not be ASCII-stripped (á é í ó ú ñ ü ¿ ¡ · à è ì ò ù ç etc.).
for (const l of ["es", "fr", "it"]) {
  if (!files.includes(`${l}.json`)) continue;
  const raw = readFileSync(join(dir, `${l}.json`));
  if (!raw.some((b) => b > 127)) fail(`${l}.json is pure ASCII — diacritics were stripped`);
}

if (failed) process.exit(1);
console.log(`i18n: ${files.length} locale files (en·es·fr·it), keys aligned, no em dashes, diacritics present`);
