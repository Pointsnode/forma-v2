#!/usr/bin/env node
/**
 * Forma v2 — rehydrate the demo catalog photos into the private `vendor-media`
 * bucket and register them in `public.vendor_photos`. Rebuilds a fresh environment
 * from the JPGs committed at supabase/seed/media/.
 *
 * Service-role. Idempotent two ways: object ids are derived from vendor_id + filename
 * (a re-run overwrites the same object and merges the same row), AND a skip guard
 * short-circuits any vendor that already has a photo row — so this is a NO-OP against
 * today's staging (photos already live) and does the work on a fresh environment.
 *
 * Slug -> vendor mapping is the one published in FORMA-DEMO-IMAGE-BRIEFS.md.
 * Object path convention: {workspace_id}/{vendor_id}/{photo_id}.jpg
 *
 * HOW TO RUN (from the forma-v2 repo root):
 *   node scripts/seed-demo-media.mjs            # rehydrate (needs service-role creds)
 *   node scripts/seed-demo-media.mjs --dry      # resolve + report, no network, no creds
 *
 * It reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment, or from the
 * first of these files at the repo root: .env.forma.keys  .env.local  .env
 *
 * By default it refuses to run against any project other than the staging ref
 * (mnmiazaclhyxotodjrsx). Pass `--allow-project <ref>` to target a fresh environment.
 * No npm dependencies. Node 18+.
 *
 * Flags:
 *   --dry                    resolve and report, upload nothing (no network, no creds)
 *   --allow-project <ref>    permit a SUPABASE_URL whose project ref is <ref>
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = dirname(HERE)
const MEDIA_DIR = join(REPO_ROOT, 'supabase', 'seed', 'media') // flat, committed JPGs
const WORKSPACE_ID = '6dd03946-8121-4894-bbc5-34a8257a5548' // Atelier Demo Studio
const BUCKET = 'vendor-media'
const STAGING_REF = 'mnmiazaclhyxotodjrsx'

const argv = process.argv.slice(2)
const DRY = argv.includes('--dry')
const allowIdx = argv.indexOf('--allow-project')
const ALLOW_PROJECT = allowIdx >= 0 ? argv[allowIdx + 1] : null

const V = (suffix) => `e1a00000-0000-4000-a000-000000000${suffix}`

// slug -> vendor id. 56 entries. henna-house (…021), the second beauty vendor, is mapped
// but has no image yet (FORMA-DEMO-IMAGE-BRIEFS.md line 92) — it surfaces as a
// missing-image WARNING, never an error.
const MAP = {
  // Venues — Mexico (10)
  'jardin-etereo': V('007'),
  'hacienda-san-gabriel': V('014'),
  'casa-alma': V('003'),
  'terraza-vista': V('005'),
  'museo-del-carmen': V('006'),
  'vinedo-santa-elena': V('001'),
  'hacienda-los-olivos': V('002'),
  'playa-escondida': V('010'),
  'nido-de-sal': V('011'),
  'cenote-azul': V('015'),
  // Venues — US / Canada / Italy / France (10)
  'stonefields-estate': V('012'),
  'foxglove-farm': V('013'),
  'sea-cliff-house': V('037'),
  'cedar-fjord-lodge': V('035'),
  'lakefield-house': V('036'),
  'villa-serrafiori': V('030'),
  'palazzo-lumia': V('031'),
  'villa-del-lago': V('032'),
  'chateau-beaumont': V('033'),
  'clos-de-pierre': V('034'),
  // Florals & decor (8)
  'flor-y-canto': V('004'),
  'wildstem-florals': V('024'),
  'bloom-tulum': V('029'),
  'flores-del-valle': V('02e'),
  'marigold-and-co': V('020'),
  'decor-norte': V('00d'),
  'atelier-lumen': V('043'),
  'forma-y-fibra': V('044'),
  // Catering, bar & coffee (11)
  'cocina-de-humo': V('008'),
  'cocina-de-valle': V('02c'),
  'fuego-y-sal': V('02d'),
  'harvest-and-hearth': V('023'),
  'mar-y-sal': V('028'),
  'salt-citrus-bar': V('047'),
  'barra-libre-mx': V('048'),
  'apero-bar': V('049'),
  'cafe-de-olla-cart': V('04a'),
  'primo-espresso': V('04b'),
  'north-bean-coffee': V('04c'),
  // Music (8)
  'dj-selva': V('00a'),
  'motif-sound': V('040'),
  'discoteca-bruna': V('041'),
  'selva-sound': V('02b'),
  'mariachi-los-reyes': V('00b'),
  'dhol-riders': V('022'),
  'the-hudson-five': V('025'),
  'coro-delle-colline': V('042'),
  // Photo, beauty & rentals (9 — henna-house has no image yet)
  'luz-films': V('009'),
  'north-light-photo': V('026'),
  'golden-hour-photo': V('02a'),
  'glow-beauty': V('00c'),
  'henna-house': V('021'),
  'rentas-del-valle': V('00e'),
  'hudson-rentals-co': V('027'),
  'maison-louer': V('045'),
  'tavola-rentals': V('046'),
}

/* ---------- credentials ---------- */

function loadEnvFile() {
  const out = {}
  for (const name of ['.env.forma.keys', '.env.local', '.env']) {
    const p = join(REPO_ROOT, name)
    if (!existsSync(p)) continue
    for (const raw of readFileSync(p, 'utf8').split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq < 0) continue
      const k = line.slice(0, eq).trim()
      let v = line.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!(k in out)) out[k] = v
    }
    console.log(`env: read ${name}`)
  }
  return out
}

const fileEnv = DRY ? {} : loadEnvFile()
const pick = (...names) => {
  for (const n of names) {
    if (process.env[n]) return process.env[n]
    if (fileEnv[n]) return fileEnv[n]
  }
  return null
}

const SUPABASE_URL = (pick('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL') || '').replace(/\/+$/, '')
const SERVICE_KEY = pick('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SERVICE_ROLE_KEY')
const refOf = (url) => (/https?:\/\/([a-z0-9]+)\.supabase\./i.exec(url) || [])[1] || null

if (!DRY) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('\nMissing credentials.')
    console.error(`  SUPABASE_URL              ${SUPABASE_URL ? 'ok' : 'NOT FOUND'}`)
    console.error(`  SUPABASE_SERVICE_ROLE_KEY ${SERVICE_KEY ? 'ok' : 'NOT FOUND'}`)
    console.error(`\nLooked in the environment and in ${REPO_ROOT}/{.env.forma.keys,.env.local,.env}`)
    console.error('Run with --dry to check the file mapping without credentials.\n')
    process.exit(1)
  }
  const urlRef = refOf(SUPABASE_URL)
  const allowed = new Set([STAGING_REF, ALLOW_PROJECT].filter(Boolean))
  if (urlRef && !allowed.has(urlRef)) {
    console.error(`\nRefusing to run: SUPABASE_URL project ref is "${urlRef}".`)
    console.error(`This script targets staging (${STAGING_REF}) by default.`)
    console.error(`For a fresh environment, pass --allow-project ${urlRef}\n`)
    process.exit(1)
  }
}

/* ---------- collect files (flat supabase/seed/media/) ---------- */

const files = []
if (existsSync(MEDIA_DIR)) {
  for (const f of readdirSync(MEDIA_DIR)) {
    const m = /^(.+)-(\d+)\.jpe?g$/i.exec(f)
    if (!m) continue
    files.push({ path: join(MEDIA_DIR, f), file: f, slug: m[1], index: Number(m[2]) })
  }
}
files.sort((a, b) => a.slug.localeCompare(b.slug) || a.index - b.index)

const unknown = files.filter((f) => !MAP[f.slug])
if (unknown.length) {
  console.error('\nUnmapped slugs (fix the map or the filename before running):')
  for (const u of unknown) console.error(`  ${u.file}`)
  process.exit(1)
}

const mappedSlugs = new Set(files.map((f) => f.slug))
const missing = Object.keys(MAP).filter((s) => !mappedSlugs.has(s))

console.log('\nforma-v2 demo photos')
console.log(`  source      ${MEDIA_DIR}`)
console.log(`  target      ${DRY ? '(dry run — no network)' : `${SUPABASE_URL} / ${BUCKET}`}`)
console.log(`  files       ${files.length}`)
console.log(`  vendors     ${mappedSlugs.size} of ${Object.keys(MAP).length} mapped slugs covered`)
for (const s of missing) console.log(`  warning     no image for ${s} (${MAP[s]}) — skipped, not an error`)
console.log('')

/* ---------- upload ---------- */

// Deterministic photo id so re-runs land on the same object and the same row.
function photoId(vendorId, file) {
  const h = createHash('sha256').update(`${vendorId}|${file}`).digest('hex')
  const v = h.slice(0, 32).split('')
  v[12] = '4' // version 4 nibble
  v[16] = ((parseInt(v[16], 16) & 0x3) | 0x8).toString(16) // variant
  const s = v.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`
}

// Skip guard: a vendor that already has a photo row is left untouched (cached per vendor),
// making the whole script a no-op against a populated environment.
const vendorHasPhotos = new Map()
async function alreadyHasPhotos(vendorId) {
  if (vendorHasPhotos.has(vendorId)) return vendorHasPhotos.get(vendorId)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vendor_photos?vendor_id=eq.${vendorId}&select=id&limit=1`, {
    headers: { authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  })
  const arr = res.ok ? await res.json() : []
  const has = Array.isArray(arr) && arr.length > 0
  vendorHasPhotos.set(vendorId, has)
  return has
}

const rows = []
let uploaded = 0
let skipped = 0
let failed = 0

for (const f of files) {
  const vendorId = MAP[f.slug]
  const id = photoId(vendorId, f.file)
  const objectPath = `${WORKSPACE_ID}/${vendorId}/${id}.jpg`

  if (DRY) {
    console.log(`  dry  ${f.slug.padEnd(24)} -> ${objectPath}`)
    continue
  }

  if (await alreadyHasPhotos(vendorId)) {
    skipped++
    console.log(`  skip ${f.slug.padEnd(24)} already has a photo row`)
    continue
  }

  const body = readFileSync(f.path)
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'content-type': 'image/jpeg',
      'cache-control': '3600',
      'x-upsert': 'true',
    },
    body,
  })
  if (!res.ok) {
    failed++
    console.error(`  FAIL ${f.slug.padEnd(24)} ${res.status} ${(await res.text()).slice(0, 200)}`)
    continue
  }
  uploaded++
  rows.push({ id, vendor_id: vendorId, storage_path: objectPath, sort: f.index - 1, caption: null })
  console.log(`  ok   ${f.slug.padEnd(24)} ${(body.length / 1024).toFixed(0)} KB`)
}

if (DRY) {
  console.log(`\nDry run. ${files.length} files mapped, ${missing.length} missing image(s). Nothing uploaded.\n`)
  process.exit(0)
}

if (failed) {
  console.error(`\n${failed} upload(s) failed. Not writing vendor_photos rows. Fix and re-run.\n`)
  process.exit(1)
}

/* ---------- register rows ---------- */

if (rows.length) {
  const insert = await fetch(`${SUPABASE_URL}/rest/v1/vendor_photos?on_conflict=id`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!insert.ok) {
    console.error(`\nUploads succeeded but the vendor_photos insert failed: ${insert.status}`)
    console.error(await insert.text())
    process.exit(1)
  }
}

console.log(`\nDone. ${uploaded} uploaded, ${skipped} skipped (already present), ${rows.length} vendor_photos rows written.\n`)
