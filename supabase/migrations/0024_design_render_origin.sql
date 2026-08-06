-- 0024 — "Set the scene": mark how a design item came to be. Additive only; anon matrix
-- stays exactly 10 functions (no tables, no policies, no grants, no function changes).

-- origin distinguishes an uploaded reference from an AI-composed concept render, so the card
-- and lightbox can wear a "Concept" chip and the cost guard can count renders per wedding.
-- Nullable, no backfill: NULL means 'upload' (today's rows are untouched and render as before).
alter table public.design_items
  add column if not exists origin text
  check (origin in ('upload', 'render'));
