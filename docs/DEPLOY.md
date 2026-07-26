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

The **service-role key is NOT used in M0** and must never be added as a
`NEXT_PUBLIC_*` var. When a later milestone needs it, it goes in a **non-public**
`SUPABASE_SERVICE_ROLE_KEY` env, read only in allowlisted server modules
(enforced by `scripts/check-service-role.mjs`).

## Staging database
`forma-v2-staging` (`mnmiazaclhyxotodjrsx`, us-east-2). Migration `0001_foundations`
is applied there; advisors clean.

## Local
```
cp .env.example .env.local   # fill in the two NEXT_PUBLIC_ values
npm ci && npm run dev
```
