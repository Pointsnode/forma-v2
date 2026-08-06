import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadContracts } from "@/lib/contracts";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { NewContract } from "@/components/contracts/new-contract";
import { Card, SectionTitle, Row, RowMain, Badge, Icon, type BadgeTone } from "@/components/ui";

const STATUS_TONE: Record<string, BadgeTone> = {
  completed: "sage", sent: "wine", partially_signed: "wine", draft: "sand", declined: "wine", voided: "sand",
};

export default async function ContractsTab({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role } = ctx;
  const tc = await getTranslations("contract");
  const contracts = await loadContracts(supabase, id);
  const templates = role === "staff" && wedding.workspace_id
    ? ((await supabase.from("contract_templates").select("id, name, kind").eq("workspace_id", wedding.workspace_id).order("created_at")).data ?? [])
    : [];

  return (
    <WeddingShell wedding={wedding} events={events} role={role} active="contracts">
      <SectionTitle title={tc("all")} accent={tc("allHint")} className="mt-0" />
      {role === "staff" ? <div className="mb-3"><NewContract weddingId={id} templates={templates as { id: string; name: string; kind: string }[]} /></div> : null}
      <Card>
        {contracts.length === 0 ? (
          <p className="py-6 text-center font-accent text-[15px] text-text-meta">{tc("empty")}</p>
        ) : (
          contracts.map((c) => (
            <Link key={c.id} href={`/wedding/${id}/contracts/${c.id}`} className="block">
              <Row className="-mx-2 rounded-[var(--radius)] px-2 hover:bg-surface-card">
                <Icon>{c.title.trim()[0]?.toUpperCase() ?? "C"}</Icon>
                <RowMain
                  title={c.title}
                  detail={
                    c.blockingTitle
                      ? <span className="text-[color:var(--color-text-danger)]">{tc("heldOn", { title: c.blockingTitle })}</span>
                      : tc(`kind_${c.kind}`)
                  }
                />
                <Badge tone={STATUS_TONE[c.status] ?? "sand"}>{tc(`status_${c.status}`)}</Badge>
              </Row>
            </Link>
          ))
        )}
      </Card>
    </WeddingShell>
  );
}
