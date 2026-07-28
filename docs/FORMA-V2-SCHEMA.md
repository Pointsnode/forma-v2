# Forma v2 — The Data Contract

**Status:** DRAFT for Gio's review. This is the third leg of the build contract: FORMA-V2-PLAN.md says *what*, the prototype (v1.12) says *how it looks and flows*, this document says *how it connects*. Every migration Antigravity writes is checked against this document at gate. If reality must diverge, this document is amended in the same PR — the doc never drifts from the database.

**Date:** 2026-07-25 · **Database:** `forma-v2-staging` (`mnmiazaclhyxotodjrsx`)

---

## 0. The prime directive: connection is enforced, not promised

v1's disease was entity silos — tables that existed but didn't reference each other, so "add a venue" showed up nowhere. v1 policed what references it *did* have with BEFORE-trigger consistency checks (the 0037/0066/0069 pattern). v2 does better: **composite foreign keys**.

Every wedding-owned parent gets a redundant unique key carrying its wedding:

```sql
alter table wedding_events add constraint wedding_events_id_wedding_uq unique (id, wedding_id);
```

Every child that references a sibling references it **together with the wedding**:

```sql
-- event_guests cannot EVER join a guest to an event of a different wedding:
foreign key (event_id, wedding_id) references wedding_events (id, wedding_id),
foreign key (guest_id, wedding_id) references guests        (id, wedding_id)
```

The database engine itself rejects any cross-wedding link. No trigger to forget, no code path to miss. This pattern applies to **every** sibling edge in this document: event↔guest, engagement↔event, ledger↔contract, menu choice↔menu, proposal↔subject, seat↔guest. A handful of edges that cross scopes on purpose (vendor catalog → engagement; workspace → wedding) are called out explicitly where they occur.

House rules carried from v1, still binding: migrations `NNNN_description.sql`, additive and idempotent, applied in order by CI; RLS on from the first migration of every table; SECURITY DEFINER functions live in `private` with thin `public` wrappers and pinned `search_path`; hermetic PGlite tests (`begin; … rollback;`) for every migration; Supabase advisors at 0 after every merge.

**New rules for v2:** every FK is indexed the day it's born. Every table gets `created_at`/`updated_at timestamptz not null default now()` + the shared `touch_updated_at` trigger. All money is `numeric(12,2)` + `currency char(3) default 'USD'`. All enums are Postgres enums, never text. `on delete` is chosen per edge and stated here — never left to default.

---

## 1. Identity & tenancy (M0 — migration 0001)

```
profiles           id uuid PK = auth.users.id · display_name · avatar_url · locale ('en'|'es')
workspaces         id PK · kind ('studio'|'couple') · name · slug UNIQUE · created_by → profiles
workspace_members  workspace_id → workspaces (CASCADE) · user_id → profiles (CASCADE)
                   role ('owner'|'planner'|'coordinator') · UNIQUE (workspace_id, user_id)
```

- `profiles` row created by AFTER-INSERT trigger on `auth.users`. Avatar from day one — the presence bubbles depend on it.
- "Planner is a role, not a business": a `studio` workspace holds weddings for clients; a `couple` workspace is a self-planning couple wearing the role. Same tables, same everything.
- RLS: members read their workspaces; owners manage members; profiles self-read/write, plus readable by co-members of any shared workspace/wedding (needed to render avatars).
- Helper (used by all later policies): `private.is_workspace_member(w uuid)` — SECURITY DEFINER, STABLE.

## 2. Weddings & events — the spine (M1 — 0002)

```
weddings          id PK · workspace_id → workspaces (RESTRICT) · slug UNIQUE
                  couple_display ('Priya & Arjun') · partner_a · partner_b
                  phase enum wedding_phase ('hiring'|'foundations'|'details'|'wedding_days'|'closed') not null default 'foundations'
                  kind ('city'|'destination') · location_city · location_country
                  date_start date · date_end date · guest_target int · budget_total numeric
                  UNIQUE (id, workspace_id)
wedding_members   wedding_id → weddings (CASCADE) · user_id → profiles · role ('partner'|'family'|'day_of')
                  UNIQUE (wedding_id, user_id)
wedding_events    id PK · wedding_id → weddings (CASCADE)
                  label · kind ('ceremony'|'reception'|'dinner'|'party'|'ritual'|'other')
                  event_date date · start_time · end_time · order_index int · guest_target int
                  UNIQUE (id, wedding_id)
```

- Seed trigger: creating a wedding inserts **one localized default event** — a wedding always has ≥ 1 event (v1's hard-won law).
- **Phase gates are computed, then recorded.** `phase` is data, but transitions are performed by one function `private.advance_wedding_phase(wedding_id)` that verifies the gate conditions of §9 and writes an `activity` row. No UI writes `phase` directly.
- `date_start/date_end` are derived from events by trigger (min/max of `event_date`) — never typed twice.
- RLS: staff (workspace members of the owning workspace) full CRUD; wedding members read + the specific writes named per table below. Helper: `private.is_wedding_staff(w uuid)`, `private.is_wedding_member(w uuid)`.
- Couple-portal access gate (Phase 1): `wedding_members` rows for the couple are **created by the contract-completion trigger** (§7) when the planner agreement completes and its deposit line is paid — the signature literally creates access. Self-planning couples (workspace kind `couple`) bypass: their membership is created with the wedding.

## 3. The loop — proposals, messages, activity (M2 — 0003)

```
proposals   id PK · wedding_id → weddings (CASCADE) · UNIQUE (id, wedding_id)
            status enum proposal_status ('draft'|'sent'|'seen'|'change_requested'|'approved'|'declined'|'withdrawn') default 'draft'
            title (≤200) · note · estimate_amount numeric(12,2) · currency char(3) default 'USD'
            created_by → profiles · responded_by → profiles · responded_at · sent_at · seen_at
            -- the subject: AT MOST ONE of (all composite-FK'd with wedding_id) — see §3A:
            event_ref     → wedding_events (id, wedding_id) ON DELETE SET NULL (event_ref)  -- M2 (0003)
            engagement_id → wedding_vendors   (a vendor/venue presentation)                 -- M4 (0005)
            quote_id      → quotes                                                          -- M5 (0006)
            menu_id       → menus · design_item_id → design_items                           -- M6 / M4
            CHECK (num_nonnulls(event_ref, engagement_id, quote_id, menu_id, design_item_id) <= 1)
proposal_messages  id PK · (proposal_id, wedding_id) composite FK → proposals (CASCADE)
                   author_id → profiles · body text (1..4000) · created_at (append-only)
activity    id PK · wedding_id → weddings (CASCADE) · actor_id → profiles NULL (system = null)
            verb text · summary text · subject jsonb · created_at (append-only) · index (wedding_id, created_at desc)
            -- feeds "Since you were away"; profiles.last_seen_at is the read cursor
wedding_invites  id PK · wedding_id → weddings (CASCADE) · UNIQUE (id, wedding_id)          -- §3B
            role ('partner'|'family'|'day_of') · token char(24) UNIQUE (server-generated, regex-gated)
            created_by → profiles · expires_at (default now()+14d) · used_by NULL · used_at NULL
```

- The FK-union subject pattern replaces string polymorphism: **every proposal points at a real row, enforced**. Adding a new proposable type later = one nullable column + widening the CHECK, in a migration.
- `status` transitions **only** through the lifecycle functions (`send_proposal`, `mark_proposal_seen`, `respond_to_proposal`, `withdraw_proposal`), each writing `activity`; a BEFORE trigger rejects any direct status write. The functions live in `private` (SECURITY DEFINER) behind thin `public` SECURITY INVOKER wrappers (§0) — the couple's only write access is these wrappers.
- When a proposal is `approved`, its subject reacts by trigger where mechanical (engagement → `shortlisted`; quote → `accepted`) — the loop moves the mesh. **These approval-moves-the-mesh triggers arrive with their subject tables (M4+); in M2, approval moves only the proposal.**
- Ball-in-court is **derived**, never stored: `sent/seen → couple`, `change_requested/draft → planner`, terminal → `none`. View `proposal_court` (security_invoker) exposes court + `age_days` (since the court last flipped) so every surface computes it identically.

### §3A amendment (M2) — freeform proposals are legal, forever
The original `CHECK (... = 1)` required a mesh subject, but four of the five subject tables don't exist until M4–M6, and the loop is communication-first ("should we do fireworks on the terrace?" is a real proposal with no subject). The check is **`num_nonnulls(...) <= 1`** — at most one subject, zero allowed. In M2 the only subject column is `event_ref`; each later migration adds its column and widens the check. The M:N `proposal_events` ("presented FOR these events") table is **deferred** to arrive with those richer subjects; M2 links a proposal to a single event via `event_ref`.

### §3B amendment (M2) — wedding_invites (the bridge to a couple)
The couple lens needs a couple, but the Phase-1 contract gate that auto-creates membership is M5 and email is M3. Bridge: **tokenized invite links**. Staff inserts a `wedding_invites` row (token server-generated by column default, regex-gated, 14-day expiry); any signed-in account calls `accept_wedding_invite(token)` (SECURITY DEFINER: validates token/expiry/unused with `for update`, creates the membership idempotently, marks used, writes activity) to become a `wedding_member`. Single-use; staff revoke by deleting an unused row. The couple never sees the `wedding_invites` table (staff-only RLS). No email in M2 — the planner copies the link.

## 4. People — guests, event_guests, touchpoints (M3 — 0004)

```
guests        id PK · wedding_id → weddings (CASCADE) · UNIQUE (id, wedding_id)
              full_name · email · phone · side ('a'|'b'|'both'|'none') · group_label
              plus_one_allowed bool · plus_one_name · dietary · notes
              rsvp_code char(16) UNIQUE  CHECK (rsvp_code ~ '^[a-f0-9]{16}$')
event_guests  PK (event_id, guest_id)
              event_id + wedding_id → wedding_events (id, wedding_id) (CASCADE)
              guest_id + wedding_id → guests (id, wedding_id) (CASCADE)
              invited bool default true · rsvp_status enum ('pending'|'yes'|'no'|'maybe') default 'pending'
              rsvp_responded_at · menu_choice_id + wedding_id → menu_options (id, wedding_id) SET NULL
              seat_ref → seats SET NULL (M6)
touchpoints   id PK · wedding_id → weddings (CASCADE)
              kind enum ('save_the_date'|'rsvp_invite'|'rsvp_reminder'|'rsvp_close'|'menu_collect'|'travel_info'|'day_of_schedule')
              scheduled_for date · status ('scheduled'|'sending'|'sent'|'skipped') · audience_rule jsonb
touchpoint_sends  touchpoint_id → touchpoints (CASCADE) · guest_id + wedding_id → guests (composite, CASCADE)
                  token char(24) UNIQUE · sent_at · opened_at · answered_at · PK (touchpoint_id, guest_id)
```

- Auto-population (v1 E2's design, kept): AFTER INSERT on `guests` → one `event_guests` row per event; AFTER INSERT on `wedding_events` → one row per guest; both `on conflict do nothing`; `invited` defaults true, planner prunes subsets (the 80-at-the-mehndi case).
- Guests never log in. The public surface is v1's **locked security pattern, ported verbatim in structure**: `public.rsvp_lookup(code)` / `public.rsvp_submit(code, responses jsonb, …)` as thin wrappers over `private.*` SECURITY DEFINER functions — regex-gated code, `for update` locks, deadline + enabled checks, per-event responses `[{event_id, status, menu_option_id}]`, error codes FM010–FM014 ('not invited to that event'), activity logged. Touchpoint answer links use `touchpoint_sends.token` through the same private layer, each collecting exactly one thing.
- Rollups (guest tab progress board, event bars) are **views**, not stored counters: `guest_rsvp_rollup`, `event_guest_counts`. Nothing to drift.
- Exceptions surface = view: guests with bounced/absent email, missing +1 names, unanswerable sends.

### §1B amendment (M3) — deferred columns + touchpoint kinds
`event_guests.menu_choice_id` (→ `menu_options`) and `seat_ref` (→ `seats`) reference M6 tables — they arrive **with those tables** in M6's migration (additive, widening), the same pattern as the proposal subject FKs. `event_guests` in 0005 is `PK (event_id, guest_id)` with the two composite FKs, `invited`, `rsvp_status`, `rsvp_responded_at`. The `touchpoint_kind` enum ships **complete** (all seven), but M3's engine schedules and sends only `rsvp_invite` / `rsvp_reminder` / `rsvp_close`; the rest become sendable when their content exists (menus/schedules, M6) — absent, not fake.

### §1C amendment (M3) — RSVP controls live on the wedding
`weddings` gains `rsvp_deadline date NULL` and `rsvp_open boolean NOT NULL default false` (0005). Staff set both from the guest tab; `rsvp_submit` refuses when closed (FM011) or past deadline (FM012). Setting `rsvp_deadline` seeds the touchpoint timeline idempotently (invite / reminder@−14d / close@deadline). The public RSVP surface is anon: `grant usage on schema private to anon` + EXECUTE on the two rsvp wrappers to anon (the guest is anonymous — the anon path IS the production path). The cron's `build_touchpoint_sends` is `service_role`-only.

## 5. Partners — catalog, presenting, engagements (M4 — 0006)

```
vendors        id PK · workspace_id → workspaces (CASCADE) · UNIQUE (id, workspace_id)   -- CATALOG, workspace-private
               name · kind enum ('venue'|'catering'|'florals'|'music'|'photo_video'|'beauty'|'decor'|'rentals'|'other')
               description · tags text[] · cities text[] (GIN-indexed — matching depends on it)
               services text · restrictions text · perks text
               contact_name · contact_email · contact_phone
               capacity int NULL · address NULL (venue-kind fields, nullable for others)
vendor_photos  id PK · vendor_id → vendors (CASCADE) · storage_path · sort · caption
vendor_files   id PK · vendor_id → vendors (CASCADE) · storage_path · label ('packet'|'rates'|'menu'|'other') · uploaded_at
wedding_vendors  -- THE ENGAGEMENT: "this vendor, presented onto this wedding"
               id PK · wedding_id → weddings (CASCADE) · UNIQUE (id, wedding_id)
               vendor_id → vendors (RESTRICT)      -- deliberate cross-scope edge: catalog → wedding
               status enum ('presented'|'shortlisted'|'quote_requested'|'quoted'|'booked'|'declined'|'archived')
               presented_note · presented_estimate · presented_at · UNIQUE (wedding_id, vendor_id)
event_vendors  engagement_id + wedding_id → wedding_vendors (id, wedding_id) (CASCADE)
               event_id + wedding_id → wedding_events (id, wedding_id) (CASCADE)
               role text NULL · PK (engagement_id, event_id)
quotes         id PK · wedding_id (composite w/ engagement) · engagement_id → wedding_vendors
               status ('requested'|'received'|'accepted'|'declined'|'expired') · amount · currency
               valid_until date · note · file storage_path NULL
```

- **Presenting is one transaction** — `private.present_vendor(vendor_id, wedding_id, event_ids[], estimate, note)` creates the engagement (`presented`), its `event_vendors` rows, **and the proposal** (§3) in one atomic call. The loop's opening move is a single function; there is no path to a "shared" vendor without a proposal.
- Guard trigger (the one BEFORE trigger v2 keeps, because it crosses scopes): engagement's `vendor.workspace_id` must equal the wedding's `workspace_id` — you can only present out of your own catalog. `vendors` deletion is RESTRICT while engagements exist.
- The couple's RLS on `vendors` is **none**. They see vendors only through `wedding_vendors` joined views scoped to their wedding — the catalog stays private, structurally.
- An event's "venue" = its `event_vendors` row whose vendor kind is `venue` and engagement status `booked`. Partial unique index enforces **at most one booked venue per event**.
- Phase-2 gate reads this table: dates locked + every event has a booked venue (§9).

### §5A–C amendments (M4)
- **§5A subjects widen:** `proposals` gains `engagement_id` + composite FK `(engagement_id, wedding_id) → wedding_vendors (id, wedding_id)` ON DELETE SET NULL(engagement_id); `CHECK (num_nonnulls(event_ref, engagement_id) <= 1)`. Freeform stays legal.
- **§5B approval moves the mesh (first instance):** approving an engagement-subject proposal advances the engagement `presented → shortlisted` (only from presented; later statuses never regress); declining → `declined`. A trigger on proposals, in the function layer.
- **§5C storage:** private bucket `vendor-media`, paths `{workspace_id}/{vendor_id}/{uuid}.{ext}`; workspace members read/write/delete under their own prefix; served via short-lived signed URLs; photos ≤5MB (app), files ≤20MB, images+pdf. Policy DDL versioned in `supabase/storage/vendor-media.sql` (storage schema is Supabase-managed, outside `migrations/`).
- **Partner view is a function, not a view:** the couple's membership-scoped projection over the private catalog is `public.wedding_partners(w)` (thin invoker over a private DEFINER function) — a security_invoker view can't read the couple-invisible `vendors`, and a security_definer view trips the advisor. The catalog stays structurally invisible.
- **advance_wedding_phase is staff-callable in M4** (planning-room Advance) via `public.advance_phase`; its FV205 venue predicate is now real (every event needs an `event_vendors` row with `venue_booked`).

## 6. Money — one ledger, fully traceable (M5 — 0007)

```
ledger_lines  id PK · wedding_id → weddings (CASCADE)
              title · amount numeric(12,2) CHECK (amount <> 0) · currency
              status enum ('expected'|'scheduled'|'due'|'paid'|'settled'|'void')
              due_date date NULL · paid_at NULL
              kind enum ('deposit'|'balance'|'progress'|'planner_fee'|'day_of_extra'|'manual')
              category text NULL
              -- traceability (each nullable, each composite-FK'd with wedding_id):
              engagement_id → wedding_vendors · quote_id → quotes · contract_id → contracts
              event_id → wedding_events ON DELETE SET NULL      -- the budget slice tag
fee_payments  id PK · wedding_id · ledger_line_id → ledger_lines (kind='planner_fee' only, trigger-checked)
              stripe_payment_intent · status · amount · created_at
```

- **One ledger.** Budget = `weddings.budget_total` vs. views over `ledger_lines`: committed (contract-linked, unpaid), paid, open. The per-event budget slice = lines tagged `event_id`. The money radar = lines with `due_date` within horizon, across a workspace's weddings. Nothing is stored twice; every number in the prototype's Budget, Money radar, and event slices is a query over this one table, and each line's `trace` renders from its FKs.
- Only `planner_fee` lines ever touch Stripe (`fee_payments`); everything else is tracked (Decision 3 in the plan). The schema keeps in-Forma vendor payments possible later by adding a payments table against the same lines — no rebuild.
- **Wedding close is computable:** `private.close_wedding(w)` verifies phase = `wedding_days`, all events past, and no line in ('expected','scheduled','due') — "all tabs settled" as a WHERE clause. Day-of extras insert as `due` and therefore block close until resolved.

## 7. Contracts — the D3 suite, mesh-fed (M5 — 0007, same migration)

Ported from v1's merged D1–D3 design (0048–0050), which is proven: `contract_templates` (workspace-scoped: full/partial/day-of/riders), `contracts` (id, wedding_id, engagement_id NULL composite-FK'd — planner agreements have none; kind ('planner_agreement'|'vendor'|'venue'); status ('draft'|'sent'|'partially_signed'|'completed'|'declined'|'voided')), `contract_draft_content`, `contract_fields` (anchored placement, org-immutable, page-fraction coordinate checks), `contract_signers` (sequential order, per-signer tokens), fill/sign via the locked v1 function pattern (`fill_contract_fields_as` / `sign_contract_as`: token→single-signer server-derived, for-update locks, order gate, required-field gate FM025, value caps, values frozen at `signed_at` by immutability trigger, declined ≠ satisfied).

**v2 additions:**
- **Merge fields resolve from the mesh:** `contract_fields.merge_source` enum ('couple_names'|'event_ref'|'venue_restrictions'|'quote_amount'|'ledger_schedule'|'workspace_profile'|'vendor_contact'|'manual') — resolved server-side at draft render; the contract room's green pills are these.
- **Contracts fire the gates:** AFTER-UPDATE trigger on completion — `planner_agreement` completed + its deposit `ledger_line` paid → create the couple's `wedding_members` rows + advance phase 1→2 (§2). Venue contract completed → engagement `booked`. Completion also emits the stamped-PDF job and files the artifact to `documents`.
- **Artifact bridge (M5 → M6, §1D):** `documents` arrives in M6 (§8). In M5 the stamped final PDF/HTML files to a private `contract-artifacts` bucket at `{wedding_id}/{contract_id}.html` (folder = wedding id, so bucket RLS keys on wedding staff/member) with the path stored on `contracts.artifact_path` — stamped by the DB on completion, uploaded by the app (self-healing on room load); M6 migrates it into a `documents` row (source `contract_artifact`). The gate fires on either order (last signature or deposit paid), both idempotent (`run_phase1_gate` guards on `phase='hiring'`).
- **Draft-hold:** a contract whose draft references an unapproved proposal (nullable composite FK `blocking_proposal_id`) cannot be sent — the "why it's still a draft" card is a real constraint, and the send happens automatically (trigger on proposal approval) exactly as the prototype's audit trail promises.

## 8. Operations (M6 — 0008)

> **M6 amendments (0008_operations):** (A) §8 is `0008` (M5 took 0007). (B) `documents`
> absorbs the artifact bridge — contract completion inserts a `documents` row
> (source `contract_artifact`, idempotent on contract_id); 0008 backfilled the 4
> existing artifacts. New private buckets `wedding-docs` + `design-media`, mime lists
> bound to shared constants + a logic guard. (C) anon surface grows to
> `menu_lookup`/`menu_submit` (`/menu/[code]`); the sweep allowlist updated same
> change. (D) proposals widen with `menu_id`, `design_item_id` — CHECK over the real
> subjects (no `quote_id` column exists). (E) What's-next is computed (goal library +
> `detect()`); `tasks` is the residue + the studio aggregation. (F) 3→4 is
> date-driven (`advance_wedding_phase`); `close_wedding` is the wedding_days→closed
> writer. day_of members are money/contract/guest-blind (`is_wedding_billing_member`).

```
schedule_items  id PK · wedding_id · event_id + wedding_id → wedding_events (CASCADE) NOT NULL
                time · title · detail · sort · done_at NULL · done_by NULL      -- run of show; day-of check-off
menus           id PK · wedding_id · event_id composite NOT NULL · title · notes
menu_options    id PK · menu_id + wedding_id → menus · label · diet_tags text[] · UNIQUE (id, wedding_id)
seating: floor_plans (event-scoped) · seating_tables · seats — seats reference event_guests
         composite-keyed so a guest can only be seated at their own event
tasks           id PK · wedding_id NULL · workspace_id NULL (CHECK exactly one) · title · due_date · done_at
                -- optional links, composite where wedding-scoped: engagement_id · contract_id · event_id · proposal_id
wedding_goal_overrides  wedding_id · goal_key text · status ('manual_done'|'dismissed') · set_by · note
                        PK (wedding_id, goal_key)     -- What's-Next: detection auto-wins upward (v1 spec, kept)
documents       id PK · wedding_id NULL · workspace_id NULL (CHECK exactly one)
                title · storage_path · source ('upload'|'contract_artifact'|'vendor_file'|'touchpoint')
                engagement_id · contract_id · event_id (nullable composite links)
design_boards / design_items  wedding-scoped · items optionally event-tagged (SET NULL)
```

- **What's Next is computed**, per the v1 spec you approved: goal library in code with `detect(weddingData)` per goal, overrides only for what detection can't see, phase-locking derived. No milestones anywhere.
- `event_id` on event-owned tables (`schedule_items`, `menus`, seating) is **NOT NULL** in v2 — those things belong to events by nature (the mock's law: an event owns its venue, schedule, menus, guests, seating, slice). Taggable things (`ledger_lines`, `design_items`, `documents`, `tasks`) stay nullable with `SET NULL`.

## 9. The gates, as predicates

| Gate | Computed from |
|---|---|
| 1 → 2 | `planner_agreement` contract `completed` **and** its deposit line `paid` (auto for `couple` workspaces) |
| 2 → 3 | `budget_total > 0` · `guest_target > 0` (or guests > 0) · location set · **every event has a booked venue** · every event dated |
| 3 → 4 | date-driven (first `event_date` arrives); readiness surfaced by What's-Next, not enforced |
| 4 → closed | all events past **and** no ledger line in ('expected','scheduled','due') |

One function per transition in `private`, each writing `activity`. The phase line, the planning room, and the couple's view all read the same predicates.

## 10. RLS matrix (summary — each migration ships its rows)

| Table group | Staff (workspace) | Couple (wedding member) | Guest (no auth) |
|---|---|---|---|
| workspace, catalog (`vendors`, templates, workspace tasks/docs) | CRUD | **nothing** | — |
| wedding spine, events, engagements, quotes, ledger, contracts, ops | CRUD (via functions where stated) | SELECT (money views respect visibility) | — |
| proposals / messages | CRUD | SELECT + respond/message **via functions only** | — |
| guests / event_guests / touchpoints | CRUD | SELECT | tokenized SECURITY-DEFINER RPCs only |
| activity | SELECT + system writes | SELECT (filtered: no money verbs if restricted) | — |

## 11. Migration ↔ milestone map & the verification harness

```
0001 M0 identity/tenancy      0002 M1 weddings+events+phase fns
0003 M2 loop                  0004 (out-of-band) private-schema grants sev-fix
0005 M3 people (guests+touchpoints+RSVP)   0006 M4 catalog+presenting
0007 M5 ledger+contracts suite             0008 M6 operations
```

*§1A renumber (M3):* `0004` became the private-grants sev-fix, so every product milestone shifts up one from M3 on. **Every migration adding a `private` function must EXPLICITLY revoke EXECUTE on its internal helpers from public/anon/authenticated** — 0004's `ALTER DEFAULT PRIVILEGES` does not reliably close functions created in a later migration (the default-privilege role context differs), so it is a backstop, not the guard.

Every migration PR must ship, and I gate on:
1. **Cross-wedding rejection tests** — for every composite FK, a hermetic test that inserts wedding A's child pointing at wedding B's parent and asserts the FK (not a trigger, not app code) rejects it.
2. **RLS matrix tests** — every role × table × verb from §10, PGlite, `begin; … rollback;`.
3. **Function-path tests** — proposals respond, present_vendor atomicity, phase transitions (each gate's positive and negative case), contract fill/sign ports (v1's 35-test suite pattern), RSVP flow, wedding close blocked by one unsettled line.
4. **Advisors 0** · `typecheck && lint && build` · guard suite (`check:service-role`, `check:public-env`, `check:test-scoping`) green.
5. **Doc parity** — the PR updates this document if and only if the schema changed; I diff both.

## 12. Connection checklist — prototype surface → query path

Every surface in v1.12, traced to its data. This is the "everything links" audit, run at every gate:

| Surface | Reads |
|---|---|
| Cockpit: Since you were away | `activity` (workspace's weddings, since last seen) |
| Cockpit: chase list | `proposal_court` = couple/vendor + age; quotes `requested` past `valid_until` |
| Cockpit: money radar | `ledger_lines` due within 60d across workspace + `planner_fee` lines |
| Cockpit: under management / Weddings bento | `weddings` ordered by `date_start` |
| Calendar | touchpoints ∪ ledger due dates ∪ event dates ∪ external calendar |
| Venue/Vendor bento + profile | `vendors` (+photos/files) · engagement badges via `wedding_vendors` |
| Present modal | `private.present_vendor(...)` → engagement + event_vendors + proposal, atomically |
| Wedding overview: waiting on a decision | `proposals` not terminal, with court + thread |
| What's Next | goal detectors over the mesh + `wedding_goal_overrides` |
| Event page facts (invited/confirmed, venue, slice) | `event_guest_counts` · booked `event_vendors` · event-tagged `ledger_lines` |
| Guest progress board + touchpoint timeline | rollup views + `touchpoints`/`touchpoint_sends` |
| Contract room (fields, ceremony, audit, draft-hold) | contracts suite + `merge_source` resolution + `blocking_proposal_id` |
| Day-of run of show + extras + close | `schedule_items.done_at` · `day_of_extra` lines · `close_wedding` predicate |
```

## 13. Concierge (M7 — the agent layer, migration `0010_concierge`)

An opted-in studio gets a concierge: an **orchestrator** (studio floor) over a mesh of **one-wedding agents** (one per wedding), mirroring the product's two-story shape. It reads the §12 surfaces and **drafts** — it never sends, signs, pays, advances, or closes. Draft-first is the *toolset*, not a prompt rule: the send/sign/pay/advance/close functions are simply absent from the registry, and the 0009 status guards + function grants stand behind that.

**Tables**

| Table | Shape | RLS |
|---|---|---|
| `concierge_settings` | `workspace_id` PK · `enabled` (default false) · `model_tier` · `monthly_token_cap` (default 20M) · timestamps | staff of workspace SELECT; writes are the studio's lever (service/manual) |
| `concierge_threads` | `id` · `workspace_id` · `wedding_id` NULL + **composite FK** `(wedding_id, workspace_id)→weddings(id, workspace_id)` (NULL = orchestrator; two-story shape) · `title` · `created_by` · timestamps | staff of workspace ALL |
| `concierge_messages` | `id` · `thread_id` · `role` ('planner'\|'concierge') · `content` · `draft_ref` jsonb (the draft this turn created) · `created_at` | staff via thread's workspace |
| `concierge_usage` | `(workspace_id, day)` PK · `tokens_in` · `tokens_out` — the honest meter | staff SELECT; writes via `concierge_record_usage` |

Couples and day_of are **wedding_members, not workspace_members** — so `is_workspace_member` RLS shuts them out of every concierge table (verified in `concierge.sql`: couple + day_of see zero with rows present).

**Identity & actor_kind.** The concierge acts through the planner's own RLS session — no new auth user, no service-role in the loop. `activity` gains `actor_kind` enum `('user','concierge')` (additive, default 'user'); `private.log_activity` stamps it from a transaction-local `forma.acting_as_concierge` flag (the 0009 pattern). Feeds render concierge rows as "Concierge (para {planner})".

**Draft-write tools** (SECURITY DEFINER, staff-checked, flag-wrapped): `concierge_draft_proposal` · `concierge_add_task` · `concierge_draft_contract` · `concierge_add_ledger_line` (all → a draft/expected row + a stamped activity verb: `proposal_drafted` / `task_drafted` / `contract_created` / `ledger_drafted`), plus `concierge_record_usage`. Reads run as the planner's session (RLS). Nothing here is anon — the anon matrix stays exactly 9.

**§12 → context mapping** (the agent's reading list, assembled server-side per scope — a wedding scope emits ONLY that wedding's rows; isolation is by construction + RLS, never prompt):

| Context line | Reads |
|---|---|
| Wedding facts / phase / countdown | `weddings` + `wedding_events` |
| Open gate items | `gateItems()` over the mesh (mirrors `advance_wedding_phase`) |
| Money (budget/paid/committed/open) | `wedding_money_rollup` |
| Guest progress | `guest_rsvp_rollup`; unanswered names via `guest_exceptions` |
| Vendors / contracts / run-of-show | goal mesh (`wedding_vendors`, `contracts`, `schedule_items`) |
| Orchestrator: per-wedding lines + upcoming dues | `weddings` + `money_radar` |

**Runtime.** A serverless agent loop inside Next.js (`/api/concierge`, Node runtime, planner session — not on the service-role allowlist). Anthropic Haiku-class default via `CONCIERGE_MODEL`/`CONCIERGE_API_KEY` (server-only env; the studio's key, never the builder's). The stable context block is prompt-cached. A soft monthly `monthly_token_cap` yields an honest refusal instead of silently eating margin.

## 14. Tasks — the four-column board (M8, migration `0011_tasks`, additive on `tasks`)

The board: **`task_status` = pending | working | waiting | completed**. "Waiting on" is the manual-task twin of the chase list's "someone else's court". Additive on the 0008 `tasks` table (which already carries the XOR wedding/workspace scope + composite-FK links).

**Columns added:** `status` (default `pending`); `assignee_kind` (`team|couple|vendor`, null = unassigned) + `assignee_member → profiles` + `assignee_vendor → vendors`; `document_id → documents`; `link_section` (event-page anchor: schedule|menus|seating|guests|budget|design); `note`. (`done_at` stays the completion timestamp, kept in sync with `status` by a trigger — one source of truth.)

**Invariants (DB-enforced — the board writes tables directly):**
- `tasks_assignee_shape` CHECK — assignee is exactly one shape: `team`⇔member set, `vendor`⇔vendor set, `couple`⇔neither (the couple is the wedding's couple side, not a person row).
- `tasks_one_link` CHECK — at most one subject link (`proposal_id | contract_id | engagement_id | document_id`); `event_id` + `link_section` is the separate event-section anchor. Every wedding-scoped link carries a **composite FK** so it can't cross weddings; all `ON DELETE SET NULL` so a deleted target degrades the task to unlinked, never dangles.
- `guard_task_links` trigger — an assignee vendor must belong to the task's workspace; a linked document must belong to the task's wedding.
- `task_state_sync` trigger — assigning to couple/vendor auto-moves `pending → waiting` (overridable by an explicit status write); `status='completed'` ⇔ `done_at`.
- `on_task_activity` trigger — one activity path for staff (direct writes), the concierge (RPC), and couple completion: `task_created` / `task_assigned` / `task_completed`, actor = `auth.uid()`, actor_kind from the concierge flag.

**RLS lanes:** staff of the wedding's workspace — full CRUD (board drag = a direct `status` update). Couple/family members — **SELECT only `assignee_kind='couple'` tasks on their wedding**; completion ONLY via `complete_task(p_task)` (staff always; couple only for couple-assigned on their wedding; no direct couple UPDATE). `day_of` — zero task access (`is_wedding_billing_member` excludes them). Nothing anon — the CI matrix stays exactly the 9.

**Concierge** `add_task` gained `assignee` (`couple` / team member / vendor by name) + `event` (by label); creation stays auto-lane, completion is not a concierge tool. The verb reconciled to `task_created` for both staff and concierge.

**Subject deep-link (§1E):** the card body lands at the linked object's room via `taskHref` (contract room / proposals / vendors / documents / event page, honoring an `#link_section` anchor), reusing the canonical routes. Contextual "+ Task" affordances on proposal cards, the contract room, the engagement lane and document rows open the quick-add **pre-linked** (the link rides in as a removable chip). **Chase:** open `waiting` tasks assigned to couple or vendor join the cockpit chase list with age badges, alongside proposals.

**Urgency:** `flagged boolean` (default false) — a flagged card shows a solid-wine flag and sorts ABOVE overdue at the top of its column; toggled from the card menu / edit sheet / concierge `add_task`; the couple sees the flag but can't set it. The master board carries filter chips (by wedding, multi-select monograms + Flagged / Overdue / Due today, additive); the wedding board carries the urgency filters only.

## 15. Floor plan & seating (M9, migration `0012_floor_plan`, additive on 0008)

v1's react-konva seating editor, rebuilt on v2's per-event foundations — closing v1's five connectivity holes. Placement: the event page's **Seating section** (canvas ↔ list toggle), per event.

**The five holes → closed:**
- **H1 wedding-scoped seating** — already healed: 0008 `floor_plans` are event-owned, `seats` are keyed `(event_id, guest_id)` with a composite FK to `event_guests`, so a guest can't be seated at an event they're not on.
- **H2 canvas ≠ list** — ONE entity: `seating_tables` gains geometry (`shape round|rect|banquet`, `x y rotation width height`) — the table IS the canvas object. Décor lives in new `floor_elements` (kind + geometry + label, **no capacity, no chairs**).
- **H3 lawless chair** — `seats.seat_no` is NOT NULL + `unique (table_id, seat_no)`; `guard_table_capacity` bounds it (`0 ≤ seat_no < capacity`); `guard_capacity_shrink` refuses shrinking below an occupied chair ("chair E is taken"). One shared `seatLabel(seat_no)` (0→A) feeds canvas, list, exports, escort cards.
- **H4 seatable ignored RSVPs** — `assign_seat` re-validates `rsvp_status='yes'` for THIS event (FS040); the sidebar/panel list only that event's attending guests; a seated-then-declined guest surfaces as an **exception chip**, never a silent lie; totals read "seated X of Y attending."
- **H5 couple editing bolted-on** — couple writes are **function-only from day one**: `assign_seat`/`unseat`/`move_floor_item` gain a couple lane gated by `is_wedding_billing_member` **and** `floor_plans.couple_can_edit` (staff toggle via `set_couple_can_edit`); day_of is excluded by construction; geometry create/resize/rotate/delete stays staff.

**Functions:** `assign_seat(p_event, p_guest, p_table, p_seat_no)` (widened; attending + capacity + double-book + lane checks; logs `seat_assigned`), `unseat` (+ couple lane, `seat_unseated`), `move_floor_item(kind, id, x, y, rotation)` (the couple's locked move, `floor_plan_updated`), `set_couple_can_edit(plan, on)` (staff). Nothing anon — the matrix stays 9.

**RLS:** staff CRUD on `floor_plans`/`seating_tables`/`seats`/`floor_elements`; any wedding member SELECT — **day_of sees names on the chart** (they run the room on the day; documented — email/contact stays blind per M6). Couple writes are function-only.

**Editor:** react-konva Stage (client-only, dynamic `ssr:false`) — v1's mechanics: 10px grid snap, 15° rotation snap, transformer resize/rotate, Delete-key, debounced save whisper, chairs derived from `seatPositions` (ring / two long sides), empty chair = paper dot + letter, occupied = wine dot + initials, click-a-chair assignment panel over the attending checklist. **Exports:** PNG (2× via `stage.toDataURL`); a print route (`/…/seating/print`) for the PDF title block + escort cards (name · table · chair · dietary). **Concierge:** a read-only `seating` tool answers "who sits at table 5"; `assign_seat` is in the approval lane (propose-only), never seated directly.

## 16. Planner directory & public profiles (M10, migration `0013_planner_directory`, additive)

The growth engine — a public, crawlable directory aimed at Google **and** answer engines (LLM citation for "who should plan my wedding in [region]"). Public routes `/planners`, `/planners/[region]`, `/p/[slug]` (siblings of `(app)`, locale-aware, hreflang). v1's posture ported onto v2's workspace model with its **six mistakes fixed**:

1. **Demo never published** — publishing is gated on real-content minimums (`publish_profile`: tagline + About in ≥1 locale, ≥1 service area, a hero, ≥3 gallery photos, ≥1 service — each refused with its own human errcode FD020–FD025). The demo studio stays `profile_published=false` forever; the `directory.sql` test proves an unpublished profile is invisible through **every** read even with a published peer present, incl. the sitemap fn.
2. **Photography required** — new **PUBLIC** bucket `planner-profiles` (`supabase/storage/planner-profiles.sql`, `public=true`, jpeg/png/webp, mimes bound in `bucket-mime.mjs` + logic test). It carries **no `storage.objects` SELECT policy** — a public bucket serves bytes by URL (getPublicUrl) from its `public` flag; a broad SELECT would only grant *listing* (linter 0025). Writes/deletes are member-gated on the `{workspace_id}` path prefix.
3. **Editorial-luxury brand design** — the public surfaces are the brand's face, NOT the admin shell: display serif on bone/paper, full-bleed photography, generous type (`src/components/directory/ui.tsx`), a graceful duotone-monogram fallback when a photo is absent (never a broken image).
4. **Region pages only when populated** — `/planners/[region]` `notFound()`s unless ≥1 published planner serves it; the index lists only regions with planners; the sitemap holds only published slugs + populated regions.
5. **Inquiries → cockpit inbox** — a new `inquiries` table + an exceptions-first cockpit card (new = wine badge) with a detail sheet: **Reply** (mailto + flips new→replied), **Convert to wedding** (`convert_inquiry` builds a foundations wedding, carries the date onto its auto-created default event via the single-event law, marks the inquiry `converted` + links `wedding_id`, logs `inquiry_converted`), **Archive**.
6. **BYO Calendly** — a discovery-call button renders only when the planner enabled it *and* the URL matches `^https://calendly\.com/…`; it self-loads the widget and opens the popup on click (storage is a later milestone).

**Schema:** `workspaces` gains `profile_published boolean` + `profile jsonb` + a `workspaces_slug_format` CHECK (**NOT VALID** — new/edited slugs must be url-safe; existing rows aren't re-checked; the public slug reuses the existing unique `slug`). New `workspace_service_areas` (normalized country/region/city) and `inquiries` (staff-RLS: `is_workspace_member` for all verbs; `status` enum new/replied/converted/archived; `wedding_id` set on convert). Profile edits go through **member-checked DEFINER** wrappers (`save_profile`, `set_profile_slug`, `set_service_areas`, `publish_profile`, `unpublish_profile`) because `workspaces_update` is owner-only.

**Reads stay service-role** — `public_planner_directory()`, `public_planner_profile(slug)`, `public_planner_slugs()` are SECURITY DEFINER with the published+studio gate inside, **granted to `service_role` ONLY** (never anon); the public pages call them via the admin client (`src/lib/directory.ts`, added to the service-role allowlist). So the read surface does **not** grow the anon matrix.

**The anon matrix grows 9 → 10** — the ONE new anon function is `submit_inquiry(slug, name, partner, email, phone, date, message, honeypot)` (SECURITY DEFINER): honeypot drops silently, published+studio slug gate (FD030), name/email/message validation (FD031–033), per-workspace 20/hour rate limit (FD034). The `people.sql` §11 allowlist adds exactly `submit_inquiry` — that allowlist IS the contract.

**SEO / answer-engine machinery (all greenfield):** per-page `generateMetadata` with canonical + both-locale hreflang alternates + OG hero; JSON-LD (`ProfessionalService` on a profile, `ItemList` on index/region); `sitemap.ts` (per-locale, published-only, force-dynamic); `robots.ts` (allow, sitemap, disallow /api); `/llms.txt` route (the citable planner list). `/planners` + `/p` added to the middleware `PUBLIC` allowlist. `NEXT_PUBLIC_SITE_URL` (in `env.ts`) is the canonical origin.

**Demo policy proof (on staging):** two published probe studios (Verena & Co., Marea — memberless, so directory-only) render the public pages with real photography; the Atelier demo studio has full profile content but `profile_published=false`. Verified live: `public_planner_directory()` returns exactly the 2 probes, `public_planner_profile('atelier-demo-studio')` is null, and the sitemap fn omits the demo slug. Advisors: 0.

## 17. The calendar (M11, migration `0014_calendar`, additive)

Fixes v1's two calendar mistakes: (1) v1's "calendar" was two lists, no grid → a real month weeks×days grid + a 12-mini-month year view (density dots per species); (2) v1 fetched Calendly at render and stored nothing → bookings are **STORED**: a webhook writes a `meetings` row and the grid renders from Forma's own DB. Placement: studio nav → **Calendar** (after Tasks), staff-only.

**Three species on one surface** (filter chips + wedding-monogram multi-select): **Meetings** (stored Calendly bookings) · **Wedding days** (every `wedding_events.event_date` across the studio's weddings) · **Due work** (`tasks.due_date`, click-through via the existing `taskHref`, anchors included). Click-through law: a meeting chip opens a sheet (invitee/email/time/join·reschedule·cancel links; canceled = struck-through, kept not hidden); a wedding-day chip → the event page; a due-work chip → `taskHref`.

**Timezone (the amendment):** meetings store `start_at` as UTC `timestamptz`; the day-cell is computed in the **connection's** IANA timezone (`calendly_connections.timezone`, captured from the Calendly user at connect), so a meeting never drifts across day-cells (`zonedDateKey`, server-side). Wedding days + task due dates are DATE-typed → zone-free, used verbatim. **Named deferral:** with no connection the only meetings are seeded demo rows, so the grid defaults to `America/Mexico_City` (documented in code); a real per-workspace timezone setting waits until a studio outside MX needs it.

**Schema:** `calendly_connections` (one per workspace; tokens + webhook signing key as AES-256-GCM ciphertext — decryption is app-side only, never in SQL; `timezone`; `webhook_subscription_id`; status active|revoked; staff-RLS). `meetings` (workspace-scoped; unique `(workspace_id, calendly_event_uri, calendly_invitee_uri)` = the idempotency key; `status` scheduled|canceled; join/cancel/reschedule urls; nullable `wedding_id` reserved for a future linkage UI — no binder in M11; index `(workspace_id, start_at)`; staff-RLS). **No DEFINER functions and nothing anon — the anon matrix stays exactly 10.**

**Flow:** OAuth per workspace (ported v1 hardening — tokens encrypted, refresh OFF the render path in `tokens.ts`). Connect (`/api/calendly/connect` → Calendly consent → `/api/calendly/callback`) stores the connection, creates the webhook subscription (callback URL carries `?w=<workspace_id>` so the webhook knows the workspace), and **backfills** already-scheduled events so day one isn't empty. The **webhook** (`/api/calendly/webhook`) verifies Calendly's HMAC signature (the subscription's stored signing key) **before any DB write**, then upserts (invitee.created → scheduled; invitee.canceled → flip to canceled, keep the row) via the **service-role** admin client — the Stripe-webhook precedent (allowlisted in `check-service-role.mjs`). Disconnect deletes the remote subscription then the row; stored meetings are kept. Page render reads only the DB. **Cockpit whisper:** "Next meeting: {invitee} · {when}" when one falls in the next 7 days.

**Activity:** no meeting activity rows — a webhook write is not a planner action, and the calendar itself is the record (reconciliation, like the M10 workspace-level events). **Secrets (Gio's):** `CALENDLY_CLIENT_ID` / `CALENDLY_CLIENT_SECRET` (the OAuth app) + `CALENDLY_TOKEN_ENC_KEY` (32-byte, hashed to a stable AES key); the webhook signing key is generated at subscription-create and stored encrypted (not an env var). **Staging:** `0014` applied, advisors 0; demo seed shows all three species (Jan-2027 P&A wedding week is the all-three marquee; the current month shows meetings live). Pure logic tested (`calendar-grid` zoning/matrix/density/filter; `calendly` crypto roundtrip + signature verify + payload normalize); hermetic `calendar.sql` (staff-RLS lanes, anon-blind, idempotent upsert, cancel-keeps-row).
