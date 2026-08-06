# The design studio · research brief and proposal
*2026-08-05. What Aisle Planner's Design Studio actually is (from their own help center and feature articles), what forma has today, and what we should build. The comparison table honestly marks this row as theirs; this is the plan to take it.*

## 1 · What Aisle Planner's Design Studio actually is

From their published documentation, four connected pieces:

**Style guides.** Named, categorized image boards per project: drag-and-drop upload, manual add, drag-to-rearrange, guides ordered within the project, an image can live in several guides at once, lightbox viewing. Used in practice for: mood boards, venue comparison boards (add candidates, delete the losers after the decision), decor decision boards (linens, place settings, escort cards: contenders in, winners consolidated into a final guide), and mixed boards of photos plus hand-drawn sketches as vendor reference.

**Color palettes.** The system auto-extracts color swatches from uploaded images; a planner clicks a swatch to save it into the project's palette or a cross-project palette; a manual color picker supplements. This is their signature move: the palette grows out of the imagery.

**Collaboration.** Two-way comments under each image; the couple gets an email when the planner comments and can reply from the email without logging in. Comments are editable/deletable.

**Reuse and export.** Master style-guide templates at the company level, imported into any project ("Add from Template"); an Export builds a "Studio Share" package (style guides + palettes + notes) to download, print, or send to clients and vendors outside the platform.

## 2 · What forma has today

`design_boards` + `design_items` per wedding: titled boards of images with a note each, optionally tied to an event, couple can view and edit, staff edit, day-of staff excluded. Honest label: mood boards. No palettes, no comments, no templates, no export, no vendor sharing.

## 3 · What we build: the design studio, forma edition

Not a clone; the same jobs done in our register, plus the two advantages they cannot follow us on (the concierge, and design tied to the actual wedding data).

**v1 · takes the row (one milestone):**

- **Boards become style guides.** Categories, drag-to-reorder (boards and images), an image in multiple guides, lightbox, cover image. Event linkage stays (a guide can belong to the mehndi).
- **The palette.** Auto-extract dominant swatches from every uploaded image (client-side quantization, no new services); tap a swatch to save it to the wedding's palette; the wedding's palette lives at the top of the design tab as a row of tiles with hex names shown on hover. A studio-level palette collects swatches across weddings. This is the feature people mean when they say Design Studio; it must feel effortless.
- **Comments.** Per-image thread, planner and couple; the couple gets a Resend email on a new planner comment with the image inline and a reply link into the portal (login-less reply is v2; the email + one-tap-to-portal is v1). Edit and delete own comments.
- **The share.** "Set the table for the vendors": export a guide (or the whole studio view) as a beautiful Edition One PDF — cover with couple name and star, the palette row, the images with notes — and a read-only share LINK for vendors (token URL, no login, expiring), consistent with how run-of-show sharing already works. This is the artifact planners actually print and hand to florists.
- **Design in the run of place.** Each guide can pin to a budget category or vendor engagement ("Florals · Flor y Canto"), so the mood board and the money it becomes stay one thing. AP cannot do this; it is our wedge in this row.

**v2 · goes past them:**

- **Master guides.** Studio-level template guides ("our tablescape language", "venues we love in San Miguel") imported into any wedding in one tap.
- **The concierge in the studio.** "Build me a starting guide from the couple's Pinterest links"; "which of our master guides fits a November hacienda wedding?"; auto-name swatches ("terracotta", "vino"). The only AI in any design studio in the category.
- **Login-less comment replies** from the email (signed token), matching AP's convenience.
- Couple mood-quiz onboarding that seeds the first guide (post-launch).

**Deliberately not building:** clip-art libraries, stock-photo search, or a drawing tool. Photographs and the planner's own eye; anything else is noise in our register.

## 4 · Comparison-table consequence

The row "Design studio depth" currently reads forma: "Mood boards, growing" — honest. When v1 ships, it becomes a dated tie ("Style guides, palettes, sharing · 2026") and with the budget/vendor pinning arguably a win; the cell changes only when the build is live, per the comparison guardrails.

## 5 · Sequencing recommendation

v1 is a natural M3-adjacent milestone (it lives in the wedding workspace, M3's territory) — either folded into M3's design-tab rebuild or immediately after it, so the surface is built once in Edition One with the full v1 feature set rather than restyled then rebuilt.
