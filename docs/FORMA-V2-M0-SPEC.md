# Forma v2 — M0 build spec: Foundations

**Status: APPROVED by Gio 2026-07-25.** Checked against FORMA-V2-PLAN.md and FORMA-V2-SCHEMA.md.

**Repo:** `Pointsnode/forma-v2`. **Database:** `forma-v2-staging` (`mnmiazaclhyxotodjrsx`, us-east-2). **Branch:** `feat/m0-foundations` → PR to `main`. Do not merge — Claude gates, Gio merges.

**Inputs (the build contract):** FORMA-V2-PLAN.md (product), FORMA-V2-SCHEMA.md (data — normative for every migration), the canonical clickable prototype `docs/prototype/forma-v2-planner-prototype.html` (UI: nav model, borderless surfaces, neutral `#121212` ink, monochrome fills, no gradients, no emojis, USD), and the Forma Brand Kit (logo, Playfair/Inter/Cormorant, palette).

**§4 amendment:** `0001_foundations` follows SCHEMA §1 exactly, including composite-key groundwork (`UNIQUE (id, workspace_id)` where specified), FK indexes, `touch_updated_at`, and the cross-wedding-rejection + RLS test-harness patterns from §11 — they start in M0.

## What M0 is
The deployed skeleton: sign up, sign in, land in a workspace, see the Forma shell in either language, served from the new stack with all guards green. No product features (no weddings/events/guests). Boring and solid.

## Scope
1. **Scaffold** — Next.js App Router + TypeScript + Tailwind; `next-intl` es/en, `localePrefix: "as-needed"`; documented `src/` conventions.
2. **Design system** — tokens/typography/base components extracted from the Brand Kit + canonical prototype (dark hero shell, event chips, nav shells, cards, stat strips, buttons, pills, hairline serif monogram circles). No gradients, no emojis, no container borders. Styleguide route in both locales.
3. **Auth** — Supabase email+password, reset, locale-aware; middleware protecting the shell; public marketing stays on forma.events (v2 app root = plain sign-in).
4. **Schema** — migration `0001_foundations`: `profiles` / `workspaces` / `workspace_members`, RLS from the first migration, membership helpers in `private`. Not in 0001: weddings/events/downstream.
5. **CI** — typecheck, lint, build, `check:service-role`, `check:public-env`, `check:test-scoping`, `test:db` (PGlite RLS matrix of 0001), `test:logic`, `npm audit --audit-level=high`, gitleaks.
6. **Deploy** — Vercel wired to the repo (Gio connects once the PR exists), envs for `forma-v2-staging`, preview per PR. See `docs/DEPLOY.md`.
7. **Docs** — FORMA-V2-PLAN.md + this file committed under `docs/`.

## NOT in this pass
Weddings, events, guests, vendors, budget, contracts (M1+); the loop (M2); Stripe (M5); email (M3); no landing page; no product feature code copied from v1.

## DoD
1. Deployed on Vercel from `main` after merge; preview green on the PR.
2. Sign up → profile created → create a workspace (both kinds) → sign out/in → land back in it, in `/` (en) and `/es`.
3. A second user added as `planner` sees the workspace; a non-member cannot (RLS verified by `test:db`, hermetic).
4. The shell renders the design-system components on a styleguide route in both locales.
5. All guards green in CI.
6. Supabase advisors: 0 errors on `forma-v2-staging`.
7. Both docs committed under `docs/`.
8. Hand off — Claude gates, Gio merges.
