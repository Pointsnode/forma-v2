import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { initials } from "@/lib/wedding";
import { currentWorkspace } from "@/lib/workspace";
import { classifyContracts } from "@/lib/studio-contracts-classify.mjs";

export type TemplateCard = { id: string; name: string; kind: string; body: string; updatedAt: string; usage: number };
export type ExceptionRow = {
  id: string; weddingId: string; weddingName: string; coupleInitials: string;
  title: string; kind: string; status: string;
  state: "held" | "awaiting" | "declined" | "ready"; tone: "wine" | "sand"; detailVal: string | null;
};
export type StudioContracts = {
  workspaceId: string | null;
  templates: TemplateCard[];
  summary: { signedCurrent: number; weddings: number };
  exceptions: ExceptionRow[];
  contractCount: number;
};

type ContractRow = {
  id: string; wedding_id: string; title: string; kind: string; status: string;
  blocking_proposal_id: string | null; template_id: string | null;
  weddings: { couple_display: string } | null;
};
type SignerRow = { contract_id: string; sign_order: number; name: string; signed_at: string | null; declined_at: string | null; decline_reason: string | null };

// The studio Contracts view: the workspace's templates (with usage) + a
// workspace-wide, exceptions-first read of every contract the planner is party
// to. RLS scopes `contracts`/`contract_signers` to the staff's own weddings.
export async function loadStudioContracts(supabase: SupabaseClient): Promise<StudioContracts> {
  const workspaceId = await currentWorkspace(supabase);
  const empty: StudioContracts = { workspaceId, templates: [], summary: { signedCurrent: 0, weddings: 0 }, exceptions: [], contractCount: 0 };
  if (!workspaceId) return empty;

  const [{ data: tpls }, { data: cons }] = await Promise.all([
    supabase.from("contract_templates").select("id, name, kind, body, updated_at").eq("workspace_id", workspaceId).order("created_at", { ascending: true }),
    supabase.from("contracts").select("id, wedding_id, title, kind, status, blocking_proposal_id, template_id, weddings(couple_display)"),
  ]);
  const contracts = (cons ?? []) as unknown as ContractRow[];

  const usage = new Map<string, number>();
  for (const c of contracts) if (c.template_id) usage.set(c.template_id, (usage.get(c.template_id) ?? 0) + 1);
  const templates: TemplateCard[] = ((tpls ?? []) as { id: string; name: string; kind: string; body: string; updated_at: string }[])
    .map((t) => ({ id: t.id, name: t.name, kind: t.kind, body: t.body, updatedAt: t.updated_at, usage: usage.get(t.id) ?? 0 }));

  const ids = contracts.map((c) => c.id);
  const blockIds = contracts.map((c) => c.blocking_proposal_id).filter((x): x is string => !!x);
  const signersBy = new Map<string, SignerRow[]>();
  const blockTitles = new Map<string, string>();
  if (ids.length) {
    const [{ data: sg }, props] = await Promise.all([
      supabase.from("contract_signers").select("contract_id, sign_order, name, signed_at, declined_at, decline_reason").in("contract_id", ids).order("sign_order"),
      blockIds.length ? supabase.from("proposals").select("id, title").in("id", blockIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);
    for (const s of (sg ?? []) as SignerRow[]) { const a = signersBy.get(s.contract_id) ?? []; a.push(s); signersBy.set(s.contract_id, a); }
    for (const p of (props.data ?? []) as { id: string; title: string }[]) blockTitles.set(p.id, p.title);
  }

  const rows = contracts.map((c) => ({
    id: c.id, weddingId: c.wedding_id, weddingName: c.weddings?.couple_display ?? "·",
    coupleInitials: initials(c.weddings?.couple_display ?? ""), title: c.title, kind: c.kind, status: c.status,
    blockingTitle: c.blocking_proposal_id ? blockTitles.get(c.blocking_proposal_id) ?? null : null,
    signers: signersBy.get(c.id) ?? [],
  }));
  const { summary, exceptions } = classifyContracts(rows) as { summary: StudioContracts["summary"]; exceptions: ExceptionRow[] };
  return { workspaceId, templates, summary, exceptions, contractCount: contracts.length };
}
