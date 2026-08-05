import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadStudioContracts, type ExceptionRow } from "@/lib/studio-contracts";
import { Card, SectionTitle, Heading, Row, RowMain, Badge, WhoBadge } from "@/components/ui";
import { TemplatesPanel } from "@/components/contracts/templates-panel";

function exceptionDetail(tc: Awaited<ReturnType<typeof getTranslations>>, r: ExceptionRow): string {
  switch (r.state) {
    case "held": return tc("exHeld", { title: r.detailVal ?? "·" });
    case "awaiting": return r.detailVal ? tc("exAwaiting", { name: r.detailVal }) : tc("exAwaitingUnknown");
    case "declined": return r.detailVal ? tc("exDeclined", { reason: r.detailVal }) : tc("exDeclinedNoReason");
    case "ready": return tc("exReady");
  }
}

export default async function StudioContractsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const lang = await getLocale();
  const tc = await getTranslations("contract");
  const supabase = await createClient();
  const { templates, summary, exceptions, contractCount } = await loadStudioContracts(supabase);

  return (
    <div>
      <SectionTitle title={tc("studioTitle")} accent={tc("studioHint")} className="mt-1" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <TemplatesPanel templates={templates} lang={lang} />
        </Card>

        <Card>
          <Heading className="text-[18px]">{tc("across")}</Heading>
          <p className="mb-3 text-[12.5px] text-muted">{tc("acrossHint")}</p>

          {contractCount === 0 ? (
            <p className="py-4 text-center font-accent text-[15px] text-muted">{tc("acrossEmpty")}</p>
          ) : (
            <>
              <Row className="-mx-2 rounded-xl px-2">
                <RowMain
                  title={tc("signedCurrent", { count: summary.signedCurrent })}
                  detail={summary.weddings === 1 ? tc("acrossWeddingsOne") : tc("acrossWeddingsOther", { count: summary.weddings })}
                />
                <Badge tone="sage">{tc("healthy")}</Badge>
              </Row>

              {exceptions.length === 0 ? (
                <p className="mt-2 py-3 text-center font-accent text-[14px] text-muted">{tc("allSigned")}</p>
              ) : (
                exceptions.map((r) => (
                  <Link key={r.id} href={`/wedding/${r.weddingId}/contracts/${r.id}`} className="block">
                    <Row className="-mx-2 rounded-xl px-2 hover:bg-bone">
                      <RowMain
                        title={<span className="inline-flex items-center gap-2">{r.title}<span className="rounded bg-bone px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.08em] text-muted">{r.weddingName}</span></span>}
                        detail={<span className={r.tone === "wine" ? "text-wine" : undefined}>{exceptionDetail(tc, r)}</span>}
                      />
                      {r.state === "held" ? (
                        <WhoBadge who="couple">{r.coupleInitials.replace("·", "")[0]?.toUpperCase() ?? "?"}</WhoBadge>
                      ) : r.state === "ready" ? (
                        <Badge tone="sand">{tc("exReadyBadge")}</Badge>
                      ) : (
                        <Badge tone="wine">{tc(`status_${r.status}`)}</Badge>
                      )}
                    </Row>
                  </Link>
                ))
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
