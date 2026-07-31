import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProposalStatus, Court, ViewProposal, MemberVM, InviteVM } from "@/lib/loop-view";
import { formatMoney } from "@/lib/wedding";

export type { ProposalStatus, Court };
export type Message = { id: string; author_id: string | null; body: string; created_at: string };
export type Proposal = {
  id: string;
  wedding_id: string;
  status: ProposalStatus;
  title: string;
  note: string | null;
  estimate_amount: string | number | null;
  currency: string;
  event_ref: string | null;
  engagement_id: string | null;
  created_by: string | null;
  responded_by: string | null;
  sent_at: string | null;
  created_at: string;
  proposal_messages: Message[];
  court: Court;
  age_days: number;
  // Engagement subject (M4): vendor identity + linked events, for the card meta.
  engVendorName: string | null;
  engEventIds: string[];
};

export type Person = { id: string; display_name: string | null; avatar_url: string | null };
export type ActivityRow = {
  id: string; wedding_id: string; actor_id: string | null; verb: string;
  summary: string; created_at: string;
};

const PROPOSAL_COLS =
  "id, wedding_id, status, title, note, estimate_amount, currency, event_ref, engagement_id, created_by, responded_by, sent_at, created_at, proposal_messages(id, author_id, body, created_at)";

// A proposal is terminal (settled) when it has left the loop.
export function isTerminal(s: ProposalStatus): boolean {
  return s === "approved" || s === "declined" || s === "withdrawn";
}

// Load a wedding's proposals joined to the court view + threaded messages, newest
// first. Court/age always come from proposal_court (the single source), merged here.
export async function loadProposals(
  supabase: SupabaseClient,
  weddingId: string,
): Promise<{ proposals: Proposal[]; people: Map<string, Person> }> {
  const [{ data: rows }, { data: court }] = await Promise.all([
    supabase.from("proposals").select(PROPOSAL_COLS).eq("wedding_id", weddingId).order("created_at", { ascending: false }),
    supabase.from("proposal_court").select("proposal_id, court, age_days").eq("wedding_id", weddingId),
  ]);
  const courtMap = new Map((court ?? []).map((c: { proposal_id: string; court: Court; age_days: number }) => [c.proposal_id, c]));

  // Engagement subjects (M4): a present-born proposal carries an engagement_id.
  // Resolve each to its vendor name + linked event ids for the card meta.
  const engIds = [...new Set(((rows ?? []) as { engagement_id: string | null }[]).map((r) => r.engagement_id).filter((x): x is string => !!x))];
  const engMap = new Map<string, { vendorName: string; eventIds: string[] }>();
  if (engIds.length) {
    const { data: engs } = await supabase
      .from("wedding_vendors")
      .select("id, vendors(name), event_vendors(event_id)")
      .in("id", engIds);
    for (const e of (engs ?? []) as unknown as { id: string; vendors: { name: string } | null; event_vendors: { event_id: string }[] }[]) {
      engMap.set(e.id, { vendorName: e.vendors?.name ?? "—", eventIds: (e.event_vendors ?? []).map((x) => x.event_id) });
    }
  }

  const proposals: Proposal[] = ((rows ?? []) as unknown as Omit<Proposal, "court" | "age_days" | "engVendorName" | "engEventIds">[]).map((p) => {
    const c = courtMap.get(p.id);
    const messages = [...(p.proposal_messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const eng = p.engagement_id ? engMap.get(p.engagement_id) : undefined;
    // The couple can't read the vendors catalogue (workspace-member-only RLS), so the vendors join
    // is null on their side and vendorName comes back "—". The present-born proposal's TITLE — set
    // by present_vendor to "{vendor name} — {kind}", and couple-readable — carries the name; fall
    // back to it rather than widening the vendors policy (§3).
    let vendorName = eng?.vendorName ?? null;
    if (p.engagement_id && (!vendorName || vendorName === "—")) vendorName = p.title.split(" — ")[0] || vendorName;
    return {
      ...p, proposal_messages: messages, court: c?.court ?? "none", age_days: c?.age_days ?? 0,
      engVendorName: vendorName, engEventIds: eng?.eventIds ?? [],
    };
  });

  const ids = new Set<string>();
  for (const p of proposals) {
    if (p.created_by) ids.add(p.created_by);
    if (p.responded_by) ids.add(p.responded_by);
    for (const m of p.proposal_messages) if (m.author_id) ids.add(m.author_id);
  }
  const people = new Map<string, Person>();
  if (ids.size) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", [...ids]);
    for (const pr of (profs ?? []) as Person[]) people.set(pr.id, pr);
  }
  return { proposals, people };
}

// wedding_members user_ids — the couple side (for message-author classification).
export async function loadCoupleIds(supabase: SupabaseClient, weddingId: string): Promise<Set<string>> {
  const { data } = await supabase.from("wedding_members").select("user_id").eq("wedding_id", weddingId);
  return new Set((data ?? []).map((r: { user_id: string }) => r.user_id));
}

export async function loadMembers(supabase: SupabaseClient, weddingId: string): Promise<MemberVM[]> {
  const { data } = await supabase.from("wedding_members").select("user_id, role").eq("wedding_id", weddingId);
  const rows = (data ?? []) as { user_id: string; role: string }[];
  if (!rows.length) return [];
  const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", rows.map((r) => r.user_id));
  const names = new Map((profs ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name]));
  return rows.map((r) => {
    const name = names.get(r.user_id) ?? "—";
    return { id: r.user_id, name, initials: personInitials(name), role: r.role };
  });
}

export async function loadPendingInvites(supabase: SupabaseClient, weddingId: string): Promise<InviteVM[]> {
  const { data } = await supabase
    .from("wedding_invites")
    .select("id, role, token, expires_at, used_at")
    .eq("wedding_id", weddingId)
    .is("used_at", null)
    .order("created_at", { ascending: false });
  return (data ?? [])
    .filter((i: { expires_at: string }) => new Date(i.expires_at) > new Date())
    .map((i: { id: string; role: string; token: string; expires_at: string }) => ({
      id: i.id, role: i.role, token: (i.token as string).trim(), expiresAt: i.expires_at,
    }));
}

export function personName(people: Map<string, Person>, id: string | null): string {
  if (!id) return "Forma";
  return people.get(id)?.display_name ?? "—";
}

export function personInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || name.slice(0, 2).toUpperCase();
}

// Build serializable view models for the client cards. coupleIds classifies a
// message author as couple-side (wine) vs planner-side; eventLabels maps event_ref
// to its label.
export function toView(
  proposals: Proposal[],
  people: Map<string, Person>,
  coupleIds: Set<string>,
  eventLabels: Map<string, string>,
  locale: string,
): ViewProposal[] {
  return proposals.map((p) => ({
    id: p.id,
    status: p.status,
    title: p.title,
    note: p.note,
    estimate: formatMoney(p.estimate_amount, locale),
    eventLabel: p.event_ref ? eventLabels.get(p.event_ref) ?? null : null,
    subject: p.engagement_id
      ? { vendorName: p.engVendorName ?? "—", eventLabels: p.engEventIds.map((id) => eventLabels.get(id)).filter((x): x is string => !!x) }
      : null,
    court: p.court,
    ageDays: p.age_days,
    messages: p.proposal_messages.map((m) => {
      const name = personName(people, m.author_id);
      return {
        id: m.id,
        authorName: name,
        authorInitials: personInitials(name),
        isCouple: !!m.author_id && coupleIds.has(m.author_id),
        body: m.body,
      };
    }),
  }));
}
