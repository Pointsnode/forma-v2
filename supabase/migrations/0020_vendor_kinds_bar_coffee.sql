-- 0020 — additive vendor kinds for the demo catalog buildout (bartenders, coffee).
-- Enum-only, no tables, no policies, no grants: the anon matrix is untouched.
alter type public.vendor_kind add value if not exists 'bar';
alter type public.vendor_kind add value if not exists 'coffee';
