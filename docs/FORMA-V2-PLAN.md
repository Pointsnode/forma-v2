# Forma v2 — Founding Plan

**Status:** DRAFT for Gio's review. Nothing gets built from this document until Gio approves it. This is the plan, not a build spec — build specs derive from it, one milestone at a time, after sign-off.

**Date:** 2026-07-25

---

## 1. What Forma is

Forma refines planning so that planners, couples, vendors and guests get exceptional lived events. For an event that spends tens or hundreds of thousands of dollars, **communication is the principle: the right communication, at the right time, in the right place.**

Everything in a wedding connects like a mesh. The planner suggests something; the couple sees it in context and accepts or asks for something else; the decision, the money, and the day-of execution all flow from that exchange — seamlessly, through Forma. Couples plan complex events with hundreds of moving parts, and it feels like a breeze because the complex mechanics are invisible and the architecture solves the problem for them.

**Where Forma wins: the multi-event wedding.** A wedding is not one event — it's a collection of events across one or more days. An Indian wedding can carry 4–5 events over 3–4 days, each with its own guest subset, venue, menus, seating, vendors, itinerary, and budget slice. That's exactly where planning gets hard, and exactly where Forma shines: every moving part easy to track, elaborate, plan, coordinate, and execute. Make planning easy. Make planning fun. Build a service so good they won't find it anywhere else in the market. And the same architecture degrades gracefully: a simple one-event wedding feels effortless, never burdened by machinery it doesn't need.

**Why v1 failed:** it built records without loops. Each feature (venues, quotes, contracts, guests, budget) was its own silo with its own table and page, and the relations between them were perpetually deferred. Adding a venue showed up nowhere and spoke to no one. v2 inverts this: **relations first, features second — and no entity ships without its loop.**

---

## 2. The five elements of the architecture

Every entity in Forma v2 ships with all five properties, or it doesn't ship:

**1. The graph** — what exists and how it connects. Every object is born with its edges (a quote belongs to a vendor engagement; a guest belongs to events; a payment belongs to a contract). Every surface reads *through* the edges — no page owns a private copy of anything.

**2. The loop** — every entity has a lifecycle: *suggested → seen → approved / change requested → confirmed → delivered*. The planner proposes; the couple decides; the state is always visible to both. When planner and couple are the same party (self-planning couples), the loop collapses gracefully into plain decisions — no fake approvals from yourself. **Presence is visual:** every open item carries a profile-photo (or color) bubble showing whose court the ball is in — planner, couple, or vendor — so any list answers "who's holding this?" at a glance. Planners, couples, and vendors all carry profile photos.

**3. The routing** — who needs to know what, when. Conversation lives **on the object** (you discuss the menu on the menu), and the system surfaces things at the right moment: the couple opens Forma to "3 things waiting on you"; the planner sees "the couple asked for a different option"; the guest gets their schedule when the day comes.

**4. The gates** — the wedding itself is a state machine (§3). Each phase has exit conditions; crossing a gate unlocks the next stage of the product. The portal always orients everyone around *what's blocking the next gate* — this is "right time" made structural, and it's why v2 will never feel like a wall of tabs.

**5. The lenses** — planner, couple, and guest are three views over the one graph, each with its own visibility and write rights per entity. Not three products; one mesh, three lenses.

---

## 3. The wedding lifecycle — four phases

### Phase 1 — Hiring a planner
The couple interviews planners inside and outside Forma — or decides to plan their own wedding. Choosing a Forma planner triggers: **contract signed + deposit paid (ACH or card via Stripe, through Forma)**. That event *creates* the couple's access to the planning portal.
**Gate:** contract signed AND deposit paid → portal unlocks.
**Self-planning couples skip this phase** and walk straight into Phase 2.

### Phase 2 — Foundations
a. Establish **budget** and **guest count**.
b. Choose **location** (city vs. destination — destination carries much more planning weight) and shortlist venues.
c. The venue loop: planner sends suggestions with estimated prices → couple picks which venues to get final quotes from → quotes come back with **date availability** → couple chooses.
d. Venue and date locked: venue contract + deposit (tracked in the ledger).
**Gate:** venue, date, location, budget, guest count all defined → Phase 3 unlocks.

### Phase 3 — Planning the details
The mesh at full flow: decoration, food, music, floor plan, flowers, makeup, and the rest. Selecting, booking and paying vendors; organizing guest seating and menus. A steady rhythm of proposals, decisions, contracts, and payments landing on the ledger.
**Gate:** soft — Phase 4 begins when the first event day arrives; Phase 3 items can still be in motion.

### Phase 4 — The wedding day(s)
Execution and settlement. Vendors set up and deliver; guests arrive; the day-of coordinator works the run of show, checking parts into completion one by one. Day-of extras land on the budget as they happen.
**Gate (wedding closes):** all events celebrated AND all tabs settled — every payment line in the ledger resolved. This is a computable condition, not a feeling.

---

## 4. Decisions locked (2026-07-25)

1. **Full rewrite.** New repo; new (fresh) Supabase project; v1 (forma.events) keeps running untouched until cutover.
2. **The v2 mock is the UI source of truth** ("events are pages, not a filter"; wedding sections never switch per event; an event page owns only what an event owns).
3. **Money:** planner's own fees flow through Stripe in Forma. All other payments (venue deposits, vendor invoices, day-of extras) happen outside but are **tracked in Forma as the ledger of record** — every expected payment, deposit, due date and balance with a status. The ledger is designed so in-Forma vendor payments can be added later as a payment-method upgrade, not a rebuild.
4. **Both personas from day one.** "Planner" is a **role, not a business.** A professional org holds it for client weddings; a self-planning couple holds it for their own. Same graph, same tools, same phases.
5. **Vendors are records at launch** — maintained by the planner; no vendor login. Tokenized vendor links (submit a quote, confirm a call time) are a later upgrade.
6. **Nothing builds until this plan is approved**, and each milestone's build spec gets approval before handoff.

---

## 5. The entity graph

The spine, with every edge named. (Design level — exact columns come per-milestone.)

```
account ── membership ── workspace            (a workspace = whoever holds the
                             │                 planner role: a pro org, or the
                             │                 couple themselves)
                             │
                          wedding ── wedding_members (couple, family, day-of team)
                             │           phase: 1 | 2 | 3 | 4 | closed
                             │
      ┌──────────────────────┼──────────────────────────┐
      │                      │                          │
   vendors            events (the spine;             budget (one total,
 (workspace rolodex;   every wedding ≥ 1)             event-taggable)
  venue = a vendor        │                              │
  kind)                   ├── schedule items          ledger lines — every line
      │                   ├── menus                   traceable to a contract,
 wedding_vendors ─────────┤── seating (plans,         quote, event, or day-of
 (engaged for this        │    tables, seats)         extra; each with status:
  wedding)                │                           expected → due → paid
      ├── quotes          └── event_guests ── guests
      ├── contract              (invited, RSVP,
      │     └── payments         menu choice —
      │        (ledger)          per event)
      └── event_vendors
          (which events they serve)
```

Guests additionally carry the **touchpoint timeline**: scheduled outreach records (what to collect, from whom, on which date, sent/reminded/answered status) — the machinery behind §6a.

**Vendors are their own world.** The catalog is **workspace-private** and rich like a real trade catalog: photos, products and services, tags, **cities served** (critical for matching), restrictions and things allowed, perks and amenities, vendor-provided PDFs, the booking contact as a person (name, email, phone), and contract history across all of the planner's weddings. A wedding never sees the catalog. The planner **presents** a vendor — *to* a wedding, *for* a specific event (or events), with an estimated price and a note in the planner's voice. Presenting is not a visibility toggle; **it is the loop's opening move**: it creates the proposal that lands in the couple's decision inbox with the ball in their court. Only presented vendors are visible to the couple and available to the venue loop, quotes, contracts, and the ledger.

Cross-cutting, attached to *any* entity: **threads** (conversation on the object), **proposals** (the loop state), **activity** (who did what, feeding the routing layer), **documents**, **tasks** (wedding-level, linkable to any entity).

Two tests the graph must pass:

**The v1 failure case, inverted:** *add a venue once* to the rolodex, engage it, link it to the ceremony — and it appears on the event page, its quote sits under Budget & quotes, its contract under Contracts, its payments feed the ledger, its guest count reads from the event. One object, visible everywhere, because every surface reads through the edges.

**The Indian wedding test:** five events over four days, three different venues, 300 guests total but only 80 invited to the mehndi — each event page shows *its* venue, *its* guests, *its* menus and seating, *its* vendors and itinerary, *its* budget slice, and its contract view (the contracts of the vendors serving it, read through `event_vendors` — no per-event paperwork duplication). The wedding level still shows one budget, one master guest list, one contract drawer. Both views are the same data through different edges.

And the counter-test, v1's hardest-won lesson kept as a principle: **a one-event wedding must feel effortless** — the event machinery reveals itself only when a second event exists.

---

## 6. The three lenses

**Planner** (pro org or self-planning couple wearing the role): a **two-story house**. The **studio floor** is the business, one level above every wedding: the list of weddings with phases at a glance, leads (the Phase-1 pipeline), the vendor catalog, contracts across all clients, services & packages, calendar (Calendly), global tasks across every wedding, admin and settings. Each **wedding floor** is one client's world: the full mesh — a board of what's proposed, what's waiting on the couple, what's blocking the next gate. Wedding nav per the mock: Overview · Tasks & milestones · Guest list · Vendors (the shared subset only) · Budget & quotes · Contracts · Design · Documents. Events open as their own pages with their own sub-nav — **one menu per scope, always**: the wedding bar never appears inside an event. The planning gear lives in its own room behind a slim status line ("Phase 3 · The details — 4 items to the next gate"), color-coded sage/wine/sand for done/current/ahead.

**Couple** (when distinct from the planner): an inbox of decisions in context. Sees proposals, responds on the object, watches the budget and the plan take shape. Not a read-only mirror — a participant in the loop.

**Guest:** their invitation, their RSVP per event, their menu choice — and when the day comes, *their* schedule, *their* seat. Right information, right time; nothing else. Guests never log in — they receive emails with tokenized links at the right moments (§6a).

### 6a. The guest journey — automated

Guests are the one audience Forma automates rather than collaborates with. The couple provides the list once; Forma runs the rest; planner and couple can forget about them.

1. **Intake.** The couple uploads or types the guest list — name, phone, email — with dedup on import.
2. **Touchpoint timeline.** A schedule of outreach dates per wedding: what gets collected, from whom, when. Sensible defaults hang off the wedding date and RSVP deadline; the planner can adjust. RSVP invite first; after RSVP closes, follow-ups collect menu choice and any details seating needs.
3. **Progressive collection.** Each email carries a tokenized link asking one thing; the answer lands directly in the mesh (`event_guests`) with nobody retyping. Email at launch; phone is captured from day one so SMS can be added without a schema change.
4. **Reminders and exceptions.** The system chases non-responders on schedule. The guest tab is a progress board — invited / answered / nudge scheduled / needs a human — and only the exceptions ask for anyone's attention.

---

## 7. Build milestones

Each milestone is one Antigravity handoff, one PR, independently shippable, and **connected on arrival** — no "wire it up later," ever. That habit is what killed v1. The couple lens ships *inside* each milestone, not as a milestone at the end.

- **M0 — Foundations.** New repo, auth, workspaces/roles (planner-as-role model), i18n (es/en), CI guards ported, design system extracted from the v2 mock. Deployed skeleton.
- **M1 — The spine.** Weddings, events, the phase state machine and gates, portal shells per the mock (wedding nav + event pages + switcher chips), the "what's blocking the next gate" overview.
- **M2 — The loop primitive.** Proposals, threads-on-objects, activity, notification surfaces. Built once as platform machinery, then every later milestone plugs into it.
- **M3 — People.** Guests + event_guests born together, guest list import (upload with dedup), guest list UI (wedding + per-event progress board), RSVP flow (v1's security pattern, per-event model), the touchpoint engine (scheduled sends, tokenized collection links, reminders), guest lens v1.
- **M4 — Partners.** Vendor rolodex, wedding engagements, event links, the Phase-2 venue loop end-to-end (suggest → shortlist → quote → choose → lock venue+date) as the first full use of M2.
- **M5 — Money.** Contracts, the payment ledger, budget with full traceability, Stripe for planner fees, the Phase-1 gate (contract + deposit → portal unlock), day-of extras, settlement math.
- **M6 — Operations & the day.** Schedule/run of show, menus, seating, tasks, documents, design board; day-of mode; wedding close ("all events celebrated, all tabs settled").
- **M7 — The concierge (the agent layer).** Post-parity, paid add-on (~$15/month per account, billed on the M5 Stripe rails). An opted-in account gets an **orchestrator agent** — the one the planner talks to — over a **mesh of wedding agents, one per wedding, expert in that wedding and only that wedding**, mirroring the product's own two-story shape (orchestrator on the studio floor, each agent on its wedding floor). It answers questions (calendar, budget, "what's left on P&A"), drafts things (quotes, proposals, chase messages, touchpoint copy), and executes simple Forma tasks — an ultra-personal assistant. **Hard rules, set now:** agents read only the views and computed surfaces (mesh, `proposal_court`, gates, rollups); agents act **only through the same private function layer as humans** — same grants, same court rules, wedding-agent isolation enforced by the composite-FK/RLS boundary, never by prompt; every agent action lands in `activity` with the agent as a recorded actor; **draft-first** — anything that would leave the studio (a send, a message to a couple) requires human approval at launch. Candidate runtime: Nous Research's Hermes agent framework (MIT; isolated subagents = the wedding-agent mesh; persistent memory; native WhatsApp/Telegram/email surfaces — a concierge the planner can text). Open economics: Hermes is a personal-agent framework, not a multi-tenant service — Forma would host per-account instances, and margin at $15/month depends on inference costs (Nous Portal tiers); fallback is a plain LLM API with the Forma function layer exposed as tools. Decided at M7, not before. Nothing in M0–M6 changes for this — the function-layer and computed-view discipline **is** the agent-readiness work.

Cutover: forma.events serves v1 untouched throughout. v2 lives on its own staging domain; the domain decision (forma.wedding vs. cutting forma.events over) is made at parity, not now.

---

## 8. Carried over from v1 — knowingly, as reference

**The contracts suite (D3).** v1 built the Documenso *experience* natively — decided 2026-07-16, never an integration (AGPL + isolation): clause editor with merge fields, PDF upload with drag field placement, sequential multi-party signing with a per-signer field-walk, decline, audit trail, templates, stamped PDF with a certificate page, value-freeze at signature. This whole experience ports to v2 with one upgrade: **merge fields resolve from the mesh** (couple, events, venues, amounts, restrictions — nothing typed twice), and signature events fire the gates (the Phase-1 agreement signing opens the couple's portal; venue signings close Phase 2).

Also copied in deliberately, never inherited wholesale: the RSVP security pattern (SECURITY DEFINER in `private`, thin `public` wrappers, regex-gated codes); the RLS patterns (org/wedding membership checks, flat child policies); consistency triggers (same-wedding/same-workspace BEFORE triggers); the CI guard suite (`check:service-role`, `check:public-env`, `check:test-scoping`, hermetic isolation tests, gitleaks); next-intl setup (`localePrefix: "as-needed"`); migration discipline (numbered, additive, idempotent). Plus any UI artifact from forma.events that matches the v2 mock — grabbed piece by piece, on merit.

---

## 9. Open questions (parked, not blocking)

1. **Pricing for self-planning couples.** Planners pay $79/$149 tiers; what the couple-led wedding pays is a business decision for later. The account model blocks no answer.
2. **Destination weddings.** Phase 2 says location can be a destination, which "carries so much more planning" — travel, accommodations, multi-day logistics. Does v2 need dedicated travel/stay entities at launch, or is v1's accommodations concept enough to port at M6?
3. **Planner discovery (Phase 1a).** Couples "interview many planners inside and outside Forma" — how much of the discovery/interview stage does Forma host at launch vs. the contract+deposit moment only?
4. **What happens to forma.events' existing data.** Demo orgs and staging fixtures — migrate anything, or clean start? (Lean: clean start.)
5. **Contract signing.** Phase 1 and Phase 2 involve signed contracts — e-signature in Forma (which provider?) vs. signed outside and uploaded.
6. **Guest outreach channels.** Email at launch (likely Resend, already in the Forma toolchain). Phone numbers are captured from day one; whether SMS/WhatsApp touchpoints ship at launch or later is open. Also open: does the guest get a day-of message (their schedule, their seat), and when.

---

## 10. Process (unchanged, tightened)

Claude specs → Antigravity builds → Claude gates on staging → Gio merges. All thinking goes into the spec once, up front; Antigravity builds a milestone to completion; progress reports need no reply; re-engagement only at a PR gate or a genuine blocker. **New rule from the v1 lesson:** every milestone spec is checked against this founding doc and the v2 mock before handoff — the spec that breaks ranks with a settled decision doesn't ship.
