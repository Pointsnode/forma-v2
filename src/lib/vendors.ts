import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedUrlMap } from "@/lib/storage";

export type VendorRow = {
  id: string; name: string; kind: string; description: string | null;
  tags: string[]; cities: string[]; services: string | null; restrictions: string | null; perks: string | null;
  contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  capacity: number | null; address: string | null;
};
export type VendorCard = { id: string; name: string; kind: string; tags: string[]; cities: string[]; heroUrl: string | null };

// The studio catalog, as bento cards with a signed hero URL (or null → fallback tile).
export async function loadVendorCards(supabase: SupabaseClient, opts: { venue: boolean }): Promise<VendorCard[]> {
  let q = supabase.from("vendors").select("id, name, kind, tags, cities, vendor_photos(storage_path, sort)").order("name", { ascending: true });
  q = opts.venue ? q.eq("kind", "venue") : q.neq("kind", "venue");
  const { data } = await q;
  const rows = (data ?? []) as unknown as (VendorCard & { vendor_photos: { storage_path: string; sort: number }[] })[];
  const heroPaths = rows.map((r) => [...(r.vendor_photos ?? [])].sort((a, b) => a.sort - b.sort)[0]?.storage_path);
  const urls = await signedUrlMap(supabase, heroPaths);
  return rows.map((r) => {
    const hero = [...(r.vendor_photos ?? [])].sort((a, b) => a.sort - b.sort)[0]?.storage_path;
    return { id: r.id, name: r.name, kind: r.kind, tags: r.tags ?? [], cities: r.cities ?? [], heroUrl: hero ? urls.get(hero) ?? null : null };
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
      return { id: r.id, status: r.status, couple: r.weddings?.couple_display ?? "—" };
    }),
  };
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
      vendor: { name: r.vendors?.name ?? "—", kind: r.vendors?.kind ?? "other" },
      couple_display: "",
      quote: latest ? { id: latest.id, status: latest.status, amount: latest.amount, valid_until: latest.valid_until } : null,
      event_ids: (r.event_vendors ?? []).map((e) => e.event_id),
    };
  });
}
