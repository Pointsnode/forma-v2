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

// Supabase auto-grants API roles on new public/private objects; replicate after migrations.
const GRANTS = `
grant usage on schema private to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on all functions in schema private to anon, authenticated, service_role;
`;

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
