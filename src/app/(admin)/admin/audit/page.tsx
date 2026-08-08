import Link from "next/link";
import { loadAudit, loadActorEmails } from "@/lib/admin/audit";
import { cx } from "@/components/ui";

export const dynamic = "force-dynamic";

const ENTITIES = ["partners", "partner_attributions", "commission_entries", "payouts", "expense_entries"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; actor?: string }> }) {
  const sp = await searchParams;
  const rows = await loadAudit({ entity: sp.entity, actor: sp.actor });
  const emails = await loadActorEmails(rows.map((r) => r.actor_id ?? "").filter(Boolean));
  const actors = [...new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))];

  const chip = (active: boolean) => cx("rounded-[var(--radius)] px-2.5 py-1 text-[12px]", active ? "bg-surface-card text-teal" : "text-text-meta hover:text-ink");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[26px] text-ink">Audit</h1>

      <div className="flex flex-wrap items-center gap-1.5">
        <Link href="/admin/audit" className={chip(!sp.entity && !sp.actor)}>all</Link>
        {ENTITIES.map((e) => <Link key={e} href={`/admin/audit?entity=${e}`} className={chip(sp.entity === e)}>{e}</Link>)}
        {actors.length > 1 || sp.actor ? <span className="mx-1 text-text-meta">·</span> : null}
        {actors.map((a) => <Link key={a} href={`/admin/audit?actor=${a}`} className={chip(sp.actor === a)}>{emails[a] ?? a.slice(0, 8)}</Link>)}
      </div>

      <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card">
        <div className="grid grid-cols-[150px_1fr_150px_1fr_auto] gap-3 border-b border-hairline-token px-[18px] py-2 text-[10px] uppercase tracking-[0.14em] text-text-meta">
          <span>When</span><span>Actor</span><span>Action</span><span>Entity</span><span>Change</span>
        </div>
        {rows.length === 0 ? <p className="px-[18px] py-8 text-center text-[14px] text-text-meta">No audit entries.</p> : rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[150px_1fr_150px_1fr_auto] items-start gap-3 border-b border-hairline-token px-[18px] py-2.5 text-[12.5px] last:border-b-0">
            <span className="text-text-meta">{r.created_at.slice(0, 19).replace("T", " ")}</span>
            <span className="truncate text-text-primary">{r.actor_id ? emails[r.actor_id] ?? r.actor_id.slice(0, 8) : "system"}</span>
            <span className="text-text-primary">{r.action}</span>
            <span className="truncate text-text-meta">{r.entity}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}</span>
            <details className="justify-self-start">
              <summary className="cursor-pointer text-[11px] text-teal">diff</summary>
              <div className="mt-1 flex flex-col gap-1">
                {r.before != null ? <pre className="max-w-[420px] overflow-x-auto rounded bg-bone p-2 text-[10px] text-text-meta">before {JSON.stringify(r.before, null, 1)}</pre> : null}
                {r.after != null ? <pre className="max-w-[420px] overflow-x-auto rounded bg-bone p-2 text-[10px] text-text-primary">after {JSON.stringify(r.after, null, 1)}</pre> : null}
              </div>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
