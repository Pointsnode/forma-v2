import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedUrlMap } from "@/lib/storage";
import { initials } from "@/lib/wedding";

export type VendorRow = {
  id: string; name: string; kind: string; description: string | null;
  tags: string[]; cities: string[]; services: string | null; restrictions: string | null; perks: string | null;
  contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  capacity: number | null; address: string | null;
};
// A catalog card knows where the vendor stands across weddings (engagement pills)
// and carries the depth the featured card renders (description/restrictions/perks/
// contact). `couple` is the wedding's monogram (e.g. "P·A").
export type CardEngagement = { couple: string; status: string };
export type VendorCard = {
  id: string; name: string; kind: string; tags: string[]; cities: string[]; heroUrl: string | null;
  description: string | null; restrictions: string | null; perks: string | null;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  capacity: number | null;
  engagements: CardEngagement[];
};

const CATALOG_COLS =
  "id, name, kind, description, tags, cities, restrictions, perks, contact_name, contact_email, contact_phone, capacity, vendor_photos(storage_path, sort), wedding_vendors(status, weddings(couple_display))";

// The studio catalog, as bento cards with a signed hero URL (or null → fallback tile).
export async function loadVendorCards(supabase: SupabaseClient, opts: { venue: boolean }): Promise<VendorCard[]> {
  let q = supabase.from("vendors").select(CATALOG_COLS).order("name", { ascending: true });
  q = opts.venue ? q.eq("kind", "venue") : q.neq("kind", "venue");
  const { data } = await q;
  const rows = (data ?? []) as unknown as {
    id: string; name: string; kind: string; description: string | null; tags: string[] | null; cities: string[] | null;
    restrictions: string | null; perks: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null;
    capacity: number | null; vendor_photos: { storage_path: string; sort: number }[];
    wedding_vendors: { status: string; weddings: { couple_display: string } | null }[];
  }[];
  const heroPaths = rows.map((r) => [...(r.vendor_photos ?? [])].sort((a, b) => a.sort - b.sort)[0]?.storage_path);
  const urls = await signedUrlMap(supabase, heroPaths);
  return rows.map((r) => {
    const hero = [...(r.vendor_photos ?? [])].sort((a, b) => a.sort - b.sort)[0]?.storage_path;
    const engagements = (r.wedding_vendors ?? [])
      .filter((e) => !["declined", "archived"].includes(e.status))
      .map((e) => ({ couple: initials(e.weddings?.couple_display ?? ""), status: e.status }));
    return {
      id: r.id, name: r.name, kind: r.kind, tags: r.tags ?? [], cities: r.cities ?? [],
      heroUrl: hero ? urls.get(hero) ?? null : null,
      description: r.description, restrictions: r.restrictions, perks: r.perks,
      contactName: r.contact_name, contactEmail: r.contact_email, contactPhone: r.contact_phone,
      capacity: r.capacity, engagements,
    };
  });
}

export type Engagement = {
  id: string; wedding_id: string; status: string; presented_estimate: string | number | null;
  vendor: { name: string; kind: string };
  couple_display: string;
  quote: { id: string; status: string; amount: string | number | null; valid_until: string | null } | null;
  event_ids: string[];
};

// Vendor profile: full record + photos/files (signed) + its engagement history.
export async function loadVendorProfile(supabase: SupabaseClient, id: string) {
  const { data: vendor } = await supabase.from("vendors")
    .select("id, name, kind, description, tags, cities, services, restrictions, perks, contact_name, contact_email, contact_phone, capacity, address")
    .eq("id", id).maybeSingle();
  if (!vendor) return null;
  const [{ data: photos }, { data: files }, { data: engs }] = await Promise.all([
    supabase.from("vendor_photos").select("id, storage_path, caption, sort").eq("vendor_id", id).order("sort"),
    supabase.from("vendor_files").select("id, storage_path, label").eq("vendor_id", id),
    supabase.from("wedding_vendors").select("id, status, weddings(couple_display)").eq("vendor_id", id),
  ]);
  const urls = await signedUrlMap(supabase, [...(photos ?? []).map((p) => p.storage_path), ...(files ?? []).map((f) => f.storage_path)]);
  return {
    vendor: vendor as VendorRow,
    photos: (photos ?? []).map((p) => ({ ...p, url: urls.get(p.storage_path) ?? null })),
    files: (files ?? []).map((f) => ({ ...f, url: urls.get(f.storage_path) ?? null })),
    engagements: (engs ?? []).map((e) => {
      const r = e as unknown as { id: string; status: string; weddings: { couple_display: string } | null };
      return { id: r.id, status: r.status, couple: r.weddings?.couple_display ?? "·" };
    }),
  };
}

// ── The engagement ledger (M13): one interleaved timeline + the price strip ──
export type LedgerQuote = { id: string; ordinal: number; status: string; amount: number | null; currency: string; validUntil: string | null; note: string | null; url: string | null; createdAt: string };
export type LedgerItem =
  | { kind: "opened"; at: string; presenter: string | null; estimate: number | null; note: string | null; events: string[] }
  | { kind: "quote"; at: string; quote: LedgerQuote }
  | { kind: "proposal"; at: string; id: string; status: string; title: string; quoteId: string | null; respondedAt: string | null }
  | { kind: "message"; at: string; id: string; authorName: string; isCouple: boolean; body: string };
export type PriceStep = { label: string; amount: number; delta: number | null; date: string };
export type EngagementLedger = {
  id: string; weddingId: string; status: string; vendorId: string; vendorName: string; vendorKind: string;
  estimate: number | null; currency: string;
  quotes: LedgerQuote[];
  timeline: LedgerItem[];
  priceStrip: PriceStep[];
  hasBudgetLine: boolean;
};

const num = (v: string | number | null | undefined): number | null => (v == null ? null : typeof v === "number" ? v : Number(v));

// Loads a single engagement's whole story, ownership-checked by the caller's RLS +
// the weddingId match. Merges the opening, every quote (with its signed PDF), every
// proposal + its response, and every message — ordered oldest-first.
export async function loadEngagementLedger(supabase: SupabaseClient, engagementId: string, weddingId: string): Promise<EngagementLedger | null> {
  const { data: eng } = await supabase.from("wedding_vendors")
    .select("id, wedding_id, status, presented_estimate, presented_note, presented_at, vendors(id, name, kind), event_vendors(event_id)")
    .eq("id", engagementId).maybeSingle();
  if (!eng) return null;
  const e = eng as unknown as {
    id: string; wedding_id: string; status: string; presented_estimate: string | number | null; presented_note: string | null; presented_at: string | null;
    vendors: { id: string; name: string; kind: string } | null; event_vendors: { event_id: string }[];
  };
  if (e.wedding_id !== weddingId) return null; // ownership recheck (mirrors the contract room)

  const [{ data: qRows }, { data: pRows }, { data: evLabels }] = await Promise.all([
    supabase.from("quotes").select("id, status, amount, currency, valid_until, note, file, created_at").eq("engagement_id", engagementId).order("created_at", { ascending: true }),
    supabase.from("proposals").select("id, status, title, quote_id, created_by, sent_at, responded_at, created_at").eq("engagement_id", engagementId).order("created_at", { ascending: true }),
    e.event_vendors.length ? supabase.from("wedding_events").select("id, label").in("id", e.event_vendors.map((x) => x.event_id)) : Promise.resolve({ data: [] as { id: string; label: string }[] }),
  ]);
  const quotesRaw = (qRows ?? []) as { id: string; status: string; amount: string | number | null; currency: string; valid_until: string | null; note: string | null; file: string | null; created_at: string }[];
  const proposals = (pRows ?? []) as { id: string; status: string; title: string; quote_id: string | null; created_by: string | null; sent_at: string | null; responded_at: string | null; created_at: string }[];
  const events = ((evLabels ?? []) as { id: string; label: string }[]).map((x) => x.label);

  // sign the quote PDFs (wedding-docs — NOT vendor-media; the file lives under the wedding prefix)
  const filePaths = quotesRaw.map((q) => q.file).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (filePaths.length) {
    const { data: su } = await supabase.storage.from("wedding-docs").createSignedUrls(filePaths, 3600);
    for (const s of su ?? []) if (s.signedUrl && s.path) signed.set(s.path, s.signedUrl);
  }
  const quotes: LedgerQuote[] = quotesRaw.map((q, i) => ({
    id: q.id, ordinal: i + 1, status: q.status, amount: num(q.amount), currency: q.currency || "USD",
    validUntil: q.valid_until, note: q.note, url: q.file ? signed.get(q.file) ?? null : null, createdAt: q.created_at,
  }));
  const currency = quotes[0]?.currency ?? "USD";

  // message authors + presenter names
  const proposalIds = proposals.map((p) => p.id);
  const { data: mRows } = proposalIds.length
    ? await supabase.from("proposal_messages").select("id, proposal_id, author_id, body, created_at").in("proposal_id", proposalIds).order("created_at", { ascending: true })
    : { data: [] as { id: string; proposal_id: string; author_id: string | null; body: string; created_at: string }[] };
  const messages = (mRows ?? []) as { id: string; proposal_id: string; author_id: string | null; body: string; created_at: string }[];
  const authorIds = [...new Set([...messages.map((m) => m.author_id), proposals[0]?.created_by].filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  const coupleIds = new Set<string>();
  if (authorIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", authorIds);
    for (const p of (profs ?? []) as { id: string; display_name: string | null }[]) names.set(p.id, p.display_name ?? "");
    const { data: members } = await supabase.from("wedding_members").select("user_id").eq("wedding_id", weddingId);
    for (const m of (members ?? []) as { user_id: string }[]) coupleIds.add(m.user_id);
  }

  const timeline: LedgerItem[] = [];
  timeline.push({ kind: "opened", at: e.presented_at ?? new Date(0).toISOString(), presenter: proposals[0]?.created_by ? names.get(proposals[0].created_by) ?? null : null, estimate: num(e.presented_estimate), note: e.presented_note, events });
  for (const q of quotes) timeline.push({ kind: "quote", at: q.createdAt, quote: q });
  for (const p of proposals) timeline.push({ kind: "proposal", at: p.sent_at ?? p.created_at, id: p.id, status: p.status, title: p.title, quoteId: p.quote_id, respondedAt: p.responded_at });
  for (const m of messages) timeline.push({ kind: "message", at: m.created_at, id: m.id, authorName: names.get(m.author_id ?? "") || "·", isCouple: coupleIds.has(m.author_id ?? ""), body: m.body });
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  // price strip: Estimate → each priced quote → (the accepted one is "Final")
  const priceStrip: PriceStep[] = [];
  const estimate = num(e.presented_estimate);
  if (estimate != null) priceStrip.push({ label: "estimate", amount: estimate, delta: null, date: e.presented_at ?? "" });
  let prev = estimate;
  const priced = quotes.filter((q) => q.amount != null);
  priced.forEach((q, i) => {
    const isFinal = q.status === "accepted" || (i === priced.length - 1 && e.status === "booked");
    priceStrip.push({ label: isFinal ? "final" : `quote${q.ordinal}`, amount: q.amount!, delta: prev != null ? q.amount! - prev : null, date: q.createdAt });
    prev = q.amount;
  });

  const { count: budgetCount } = await supabase.from("ledger_lines").select("id", { count: "exact", head: true }).eq("engagement_id", engagementId);

  return {
    id: e.id, weddingId, status: e.status, vendorId: e.vendors?.id ?? "", vendorName: e.vendors?.name ?? "·", vendorKind: e.vendors?.kind ?? "other",
    estimate, currency, quotes, timeline, priceStrip, hasBudgetLine: (budgetCount ?? 0) > 0,
  };
}

// The workspace catalogue for the wedding-side present picker: every vendor, with
// whether it is already LIVE on this wedding (a live engagement can't be re-presented;
// declined/archived may be). One catalogue — the wedding never owns a vendor.
export type PickVendor = { id: string; name: string; kind: string; cities: string[]; live: boolean };
export async function loadPresentCatalogue(supabase: SupabaseClient, weddingId: string): Promise<PickVendor[]> {
  const [{ data: vendors }, { data: engs }] = await Promise.all([
    supabase.from("vendors").select("id, name, kind, cities").order("name", { ascending: true }),
    supabase.from("wedding_vendors").select("vendor_id, status").eq("wedding_id", weddingId),
  ]);
  const live = new Set(
    ((engs ?? []) as { vendor_id: string; status: string }[])
      .filter((e) => ["presented", "shortlisted", "quote_requested", "quoted", "booked"].includes(e.status))
      .map((e) => e.vendor_id),
  );
  return ((vendors ?? []) as { id: string; name: string; kind: string; cities: string[] | null }[]).map((v) => ({
    id: v.id, name: v.name, kind: v.kind, cities: v.cities ?? [], live: live.has(v.id),
  }));
}

// Event ids that have a booked venue — the live 2→3 venue predicate.
export async function loadVenuedEventIds(supabase: SupabaseClient, weddingId: string): Promise<Set<string>> {
  const { data } = await supabase.from("event_vendors").select("event_id").eq("wedding_id", weddingId).eq("venue_booked", true);
  return new Set((data ?? []).map((r: { event_id: string }) => r.event_id));
}

// Engagements for a wedding's Vendors tab (staff) — with vendor identity, latest
// quote, and the linked events.
export async function loadWeddingEngagements(supabase: SupabaseClient, weddingId: string): Promise<Engagement[]> {
  const { data } = await supabase.from("wedding_vendors")
    .select("id, wedding_id, status, presented_estimate, vendors(name, kind), quotes(id, status, amount, valid_until, created_at), event_vendors(event_id)")
    .eq("wedding_id", weddingId)
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as {
    id: string; wedding_id: string; status: string; presented_estimate: string | number | null;
    vendors: { name: string; kind: string } | null;
    quotes: { id: string; status: string; amount: string | number | null; valid_until: string | null; created_at: string }[];
    event_vendors: { event_id: string }[];
  }[]).map((r) => {
    const latest = [...(r.quotes ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    return {
      id: r.id, wedding_id: r.wedding_id, status: r.status, presented_estimate: r.presented_estimate,
      vendor: { name: r.vendors?.name ?? "·", kind: r.vendors?.kind ?? "other" },
      couple_display: "",
      quote: latest ? { id: latest.id, status: latest.status, amount: latest.amount, valid_until: latest.valid_until } : null,
      event_ids: (r.event_vendors ?? []).map((e) => e.event_id),
    };
  });
}
