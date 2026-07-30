import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { DocUpload } from "@/components/wedding/doc-upload";
import { Card, SectionTitle, Row, RowMain, Icon } from "@/components/ui";
import { QuickAddTask } from "@/components/tasks/quick-add";

// M13: vendor quote PDFs are filed under the wedding prefix in wedding-docs (NOT
// vendor-media, whose policy would leak a wedding-specific price across couples).
const BUCKET: Record<string, string> = { contract_artifact: "contract-artifacts", upload: "wedding-docs", vendor_file: "wedding-docs", touchpoint: "wedding-docs" };

export default async function DocumentsTab({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role } = ctx;
  const t = await getTranslations("ops");

  const { data: docRows } = await supabase.from("documents").select("id, title, source, storage_path, contract_id, event_id").eq("wedding_id", id).order("created_at", { ascending: false });
  const docs = (docRows ?? []) as { id: string; title: string; source: string; storage_path: string | null; contract_id: string | null; event_id: string | null }[];
  const eventLabel = new Map(events.map((e) => [e.id, e.label]));

  // signed URLs per bucket
  const urls = new Map<string, string>();
  await Promise.all(docs.filter((d) => d.storage_path).map(async (d) => {
    const { data } = await supabase.storage.from(BUCKET[d.source] ?? "wedding-docs").createSignedUrl(d.storage_path!, 3600);
    if (data?.signedUrl) urls.set(d.id, data.signedUrl);
  }));

  return (
    <WeddingShell wedding={wedding} events={events} role={role} active="documents">
      <SectionTitle title={t("documents")} accent={t("documentsHint")} className="mt-0" />
      {role === "staff" || role === "member" ? <div className="mb-4"><DocUpload weddingId={id} /></div> : null}
      <Card>
        {docs.length === 0 ? (
          <p className="py-6 text-center font-accent text-[15px] text-muted">{t("noDocuments")}</p>
        ) : (
          docs.map((d) => {
            const url = urls.get(d.id);
            const detail = [d.source === "contract_artifact" ? t("srcContract") : d.source === "upload" ? t("srcUpload") : d.source, d.event_id ? eventLabel.get(d.event_id) : null].filter(Boolean).join(" · ");
            const inner = (
              <>
                <Icon>{d.title.trim()[0]?.toUpperCase() ?? "D"}</Icon>
                <RowMain title={d.title} detail={detail} />
                {url ? <span className="shrink-0 text-[12px] text-wine">{t("open")} ↓</span> : null}
              </>
            );
            return (
              <Row key={d.id} className="-mx-2 rounded-xl px-2 hover:bg-bone">
                {url ? <a href={url} target="_blank" rel="noopener" className="flex min-w-0 flex-1 items-center gap-3">{inner}</a> : <span className="flex min-w-0 flex-1 items-center gap-3">{inner}</span>}
                {role === "staff" ? <QuickAddTask weddings={[]} workspaceId="" defaultWeddingId={id} prelink={{ kind: "document", id: d.id, label: d.title }} variant="inline" /> : null}
              </Row>
            );
          })
        )}
      </Card>
    </WeddingShell>
  );
}
