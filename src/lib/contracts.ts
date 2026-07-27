import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMoney } from "@/lib/wedding";

export type ContractRow = { id: string; title: string; kind: string; status: string; blocking_proposal_id: string | null; artifact_path: string | null };
export type ContractField = { id: string; field_key: string; label: string; merge_source: string; signer_order: number | null; required: boolean; resolved: string | null };
export type ContractSigner = { id: string; sign_order: number; role: string; name: string; email: string | null; signed_at: string | null; declined_at: string | null; decline_reason: string | null };

export async function loadContracts(supabase: SupabaseClient, weddingId: string): Promise<(ContractRow & { blockingTitle: string | null })[]> {
  const { data } = await supabase.from("contracts").select("id, title, kind, status, blocking_proposal_id, artifact_path").eq("wedding_id", weddingId).order("created_at", { ascending: true });
  const rows = (data ?? []) as ContractRow[];
  const blockIds = rows.map((r) => r.blocking_proposal_id).filter((x): x is string => !!x);
  const titles = new Map<string, string>();
  if (blockIds.length) {
    const { data: props } = await supabase.from("proposals").select("id, title").in("id", blockIds);
    for (const p of (props ?? []) as { id: string; title: string }[]) titles.set(p.id, p.title);
  }
  return rows.map((r) => ({ ...r, blockingTitle: r.blocking_proposal_id ? titles.get(r.blocking_proposal_id) ?? null : null }));
}

// Resolve merge fields from the mesh — server-side, at draft render (the green
// pills) and again as the frozen snapshot passed to send_contract.
export async function resolveMergeFields(
  supabase: SupabaseClient,
  contract: { id: string; wedding_id: string; engagement_id: string | null },
  fields: { field_key: string; merge_source: string }[],
  locale: string,
): Promise<Record<string, string>> {
  const need = new Set(fields.filter((f) => f.merge_source !== "manual").map((f) => f.merge_source));
  if (need.size === 0) return {};
  const { data: wed } = await supabase.from("weddings").select("couple_display, workspace_id").eq("id", contract.wedding_id).maybeSingle();
  const out: Record<string, string> = {};
  const wsName = wed?.workspace_id ? ((await supabase.from("workspaces").select("name").eq("id", wed.workspace_id).maybeSingle()).data?.name ?? "") : "";

  type Vendor = { name: string; restrictions: string | null; contact_name: string | null; contact_email: string | null };
  let vendor: Vendor | null = null;
  let events: string[] = [];
  let quoteAmt: number | null = null;
  if (contract.engagement_id) {
    const { data: eng } = await supabase.from("wedding_vendors").select("vendors(name, restrictions, contact_name, contact_email), event_vendors(wedding_events(label)), quotes(amount, status, created_at)").eq("id", contract.engagement_id).maybeSingle();
    const e = eng as unknown as { vendors: Vendor | null; event_vendors: { wedding_events: { label: string } | null }[]; quotes: { amount: number; status: string; created_at: string }[] } | null;
    vendor = e?.vendors ?? null;
    events = (e?.event_vendors ?? []).map((x) => x.wedding_events?.label).filter((x): x is string => !!x);
    const q = [...(e?.quotes ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    quoteAmt = q?.amount ?? null;
  }
  const { data: ledger } = await supabase.from("ledger_lines").select("title, amount").eq("contract_id", contract.id);

  for (const f of fields) {
    switch (f.merge_source) {
      case "couple_names": out[f.field_key] = wed?.couple_display ?? ""; break;
      case "workspace_profile": out[f.field_key] = wsName; break;
      case "vendor_contact": out[f.field_key] = [vendor?.contact_name, vendor?.contact_email].filter(Boolean).join(" · "); break;
      case "venue_restrictions": out[f.field_key] = vendor?.restrictions ?? ""; break;
      case "event_ref": out[f.field_key] = events.join(", "); break;
      case "quote_amount": out[f.field_key] = formatMoney(quoteAmt, locale) ?? "—"; break;
      case "ledger_schedule": out[f.field_key] = (ledger ?? []).map((l: { title: string; amount: number }) => `${l.title}: ${formatMoney(l.amount, locale)}`).join(" · "); break;
      default: break; // manual
    }
  }
  return out;
}

export async function loadContractRoom(supabase: SupabaseClient, contractId: string, locale: string): Promise<{
  contract: { id: string; wedding_id: string; title: string; kind: string; status: string; engagement_id: string | null; blocking_proposal_id: string | null; artifact_path: string | null };
  body: string; fields: ContractField[]; signers: ContractSigner[]; blockingTitle: string | null;
} | null> {
  const { data: c } = await supabase.from("contracts").select("id, wedding_id, title, kind, status, engagement_id, blocking_proposal_id, artifact_path").eq("id", contractId).maybeSingle();
  if (!c) return null;
  const [{ data: content }, { data: fieldRows }, { data: signerRows }] = await Promise.all([
    supabase.from("contract_draft_content").select("body").eq("contract_id", contractId).maybeSingle(),
    supabase.from("contract_fields").select("id, field_key, label, merge_source, signer_order, required, resolved_value, manual_value, sort").eq("contract_id", contractId).order("sort"),
    supabase.from("contract_signers").select("id, sign_order, role, name, email, signed_at, declined_at, decline_reason").eq("contract_id", contractId).order("sign_order"),
  ]);
  const rawFields = (fieldRows ?? []) as { id: string; field_key: string; label: string; merge_source: string; signer_order: number | null; required: boolean; resolved_value: string | null; manual_value: string | null }[];
  // live-resolve for draft pills; once sent, resolved_value is the frozen snapshot
  const live = c.status === "draft" ? await resolveMergeFields(supabase, c, rawFields, locale) : {};
  const fields: ContractField[] = rawFields.map((f) => ({
    id: f.id, field_key: f.field_key, label: f.label, merge_source: f.merge_source, signer_order: f.signer_order, required: f.required,
    resolved: f.merge_source === "manual" ? f.manual_value : (f.resolved_value ?? live[f.field_key] ?? null),
  }));
  let blockingTitle: string | null = null;
  if (c.blocking_proposal_id) {
    const { data: p } = await supabase.from("proposals").select("title").eq("id", c.blocking_proposal_id).maybeSingle();
    blockingTitle = p?.title ?? null;
  }
  return { contract: c, body: content?.body ?? "", fields, signers: (signerRows ?? []) as ContractSigner[], blockingTitle };
}
