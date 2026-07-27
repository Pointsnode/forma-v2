# Forma v2 — Deploy (M0)

Vercel project wired to `Pointsnode/forma-v2`. **Gio connects the repo in Vercel
once this PR exists** (Vercel → Add Project → import the repo). Until then there
is no live preview URL — that is expected at M0 and not a gate failure.

## Environment variables (names only — never commit values)

Set in Vercel (Production + Preview) and in a local `.env.local`:

| Name | Where it comes from | Exposed to client? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API → Project URL | yes (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API → Project API keys → `anon` `public` | yes (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → `service_role` `secret` | **no — server only** (M3 touchpoint cron) |
| `RESEND_API_KEY` | Resend → API Keys (domain `forma.events` verified) | **no — server only** (M3 email) |
| `CRON_SECRET` | any long random string; Vercel sends it as `Authorization: Bearer …` to the cron | **no — server only** (M3 cron auth) |

**Server-only means server-only.** `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
and `CRON_SECRET` must never be added as `NEXT_PUBLIC_*` vars — `scripts/check-public-env.mjs`
fails the build on any `NEXT_PUBLIC_*RESEND*` / `*CRON*` / `*SERVICE_ROLE*`, and the
service-role client is confined to allowlisted modules by `scripts/check-service-role.mjs`.
The touchpoint cron (`vercel.json` → `/api/touchpoints/run`, daily 14:00 UTC) is a
no-op until `RESEND_API_KEY` + `CRON_SECRET` are set — sending is skipped gracefully,
so a missing key is not a build failure.

## Staging database
`forma-v2-staging` (`mnmiazaclhyxotodjrsx`, us-east-2). Migration `0001_foundations`
is applied there; advisors clean.

## Local
```
cp .env.example .env.local   # fill in the two NEXT_PUBLIC_ values
npm ci && npm run dev
```
