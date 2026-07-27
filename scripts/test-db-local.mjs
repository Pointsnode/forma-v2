#!/usr/bin/env node
// Hermetic DB tests on PGlite. Boots a bare Postgres, stubs the Supabase-isms
// the migrations depend on (auth schema/users, anon/authenticated/service_role
// roles, auth.uid() reading request.jwt.claims, grants), applies every migration
// in filename order, then runs each supabase/tests/*.sql (begin; … rollback;).
// A raised exception fails the test. Ported pattern from v1.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = new URL("..", import.meta.url).pathname;
const migDir = join(ROOT, "supabase/migrations");
const testDir = join(ROOT, "supabase/tests");

const BOOTSTRAP = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`;

// Replicate Supabase's default API-role grants on PUBLIC objects — and NOTHING on
// schema `private`. Access to private (USAGE + per-function EXECUTE) must come from
// the migrations themselves (0004), exactly as in production; granting it here
// would mask a missing grant. Role identity is part of the call shape: tests run
// each RPC under `set local role authenticated`, so a grant-starved private schema
// fails the same way it would for a real user.
const GRANTS = `
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
`;
// NB: no blanket EXECUTE grant to anon on public functions. anon's function access
// must come only from a migration's explicit grant (the 3 rsvp wrappers) — a broad
// grant here would mask a missing/forgotten revoke, exactly as the private over-grant
// did before 0004. anon still holds Postgres's PUBLIC default until a migration
// revokes it, so the anon-executability matrix test reflects the real ACL.

const migrations = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
const tests = readdirSync(testDir).filter((f) => f.endsWith(".sql") && !f.startsWith("_")).sort();

let failures = 0;

async function freshDb() {
  const db = new PGlite();
  await db.exec(BOOTSTRAP);
  for (const m of migrations) {
    await db.exec(readFileSync(join(migDir, m), "utf8"));
  }
  await db.exec(GRANTS);
  return db;
}

// Report migrations apply (once).
try {
  const db = await freshDb();
  for (const m of migrations) console.log(`migration ${m} ... ok`);
  await db.close();
} catch (e) {
  console.error(`migration apply FAILED: ${e.message}`);
  process.exit(1);
}

for (const t of tests) {
  const db = await freshDb();
  try {
    await db.exec(readFileSync(join(testDir, t), "utf8"));
    console.log(`test ${t} ... PASSED`);
  } catch (e) {
    console.error(`test ${t} ... FAILED\n${e.message}`);
    failures++;
  } finally {
    await db.close();
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log(`\nall db tests passed (${tests.length})`);
