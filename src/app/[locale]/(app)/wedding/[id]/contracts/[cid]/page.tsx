import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadContractRoom } from "@/lib/contracts";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { SendButton, VoidButton } from "@/components/contracts/room-controls";
import { Card, Heading, Badge, WhoBadge, Check, Row, RowMain, cx, type BadgeTone } from "@/components/ui";

const STATUS_TONE: Record<string, BadgeTone> = {
  completed: "sage", sent: "wine", partially_signed: "wine", draft: "sand", declined: "wine", voided: "sand",
};
const whoFor = (role: string) => (role === "couple" ? "couple" : role === "vendor" ? "vendor" : "planner") as "couple" | "vendor" | "planner";

export default async function ContractRoom({ params }: { params: Promise<{ locale: string; id: string; cid: string }> }) {
  const { locale, id, cid } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role } = ctx;
  const lang = await getLocale();
  const tc = await getTranslations("contract");

  const room = await loadContractRoom(supabase, cid, lang);
  if (!room || room.contract.wedding_id !== id) notFound();
  const { contract, body, fields, signers, blockingTitle } = room;
  const held = !!contract.blocking_proposal_id && contract.status === "draft";

  // audit trail — this contract's activity
  const { data: acts } = await supabase
    .from("activity").select("id, verb, summary, created_at, actor_id")
    .eq("wedding_id", id).contains("subject", { contract_id: cid })
    .order("created_at", { ascending: true });

  return (
    <WeddingShell wedding={wedding} events={events} role={role} active="contracts">
      <nav className="mb-4 text-[12.5px] text-muted">
        <Link href={`/wedding/${id}/contracts`} className="hover:text-ink hover:underline hover:underline-offset-2">{tc("all")}</Link>
        <span className="mx-2 text-hairline">/</span>
        <span className="font-display text-[15px] text-ink">{contract.title}</span>
      </nav>

      <div className="grid gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        {/* the document + resolved merge pills */}
        <div className="flex flex-col gap-[18px]">
          <Card className="bg-[#FFFEFB] px-9 py-9">
            <div className="mb-1 flex items-center gap-3">
              <Heading className="text-[24px]">{contract.title}</Heading>
              <Badge tone={STATUS_TONE[contract.status] ?? "sand"}>{tc(`status_${contract.status}`)}</Badge>
            </div>
            <p className="mb-4 font-accent text-[15px] italic text-taupe">{tc("draftSub")}</p>
            {body ? <p className="mb-4 whitespace-pre-wrap text-[13.5px] leading-[1.7] text-ink-soft">{body}</p> : null}
            {fields.length ? (
              <>
                <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-muted">{tc("mergeFields")}</p>
                <div className="flex flex-wrap gap-2">
                  {fields.map((f) => (
                    <span key={f.id} className={cx(
                      "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[12.5px]",
                      f.merge_source === "manual" ? "bg-sand-soft text-taupe" : "bg-sage-soft text-sage-ink",
                    )} title={f.merge_source}>
                      <span className="font-medium">{f.label}:</span>
                      <span>{f.resolved || (f.merge_source === "manual" ? tc("signerFills") : "—")}</span>
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </Card>

          {held ? (
            <Card>
              <Heading className="text-[18px]">{tc("whyDraft")}</Heading>
              <Row>
                <Check ok={false} />
                <RowMain title={tc("blockedTitle")} detail={tc("heldOn", { title: blockingTitle ?? "—" })} />
                <Badge tone="wine">{tc("waiting")}</Badge>
              </Row>
              <p className="mt-2 text-[12.5px] text-muted">{tc("autoSends")}</p>
            </Card>
          ) : null}
        </div>

        {/* signing ceremony + controls + audit */}
        <div className="flex flex-col gap-[18px]">
          <Card>
            <Heading className="text-[18px]">{tc("ceremony")}</Heading>
            <p className="mb-3 mt-0.5 text-[12.5px] text-muted">{tc("ceremonyHint")}</p>
            {signers.map((s) => (
              <Row key={s.id}>
                <span className="font-accent text-[14px] italic text-taupe">{s.sign_order}</span>
                <WhoBadge who={whoFor(s.role)}>{(s.name.trim()[0] ?? "?").toUpperCase()}</WhoBadge>
                <RowMain title={s.name} detail={s.email ?? tc(`role_${s.role}`)} />
                {s.declined_at ? <Badge tone="wine">{tc("declined")}</Badge>
                  : s.signed_at ? <Badge tone="sage">{tc("signed")}</Badge>
                  : <Badge tone="sand">{tc("queued")}</Badge>}
              </Row>
            ))}
            {role === "staff" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {contract.status === "draft" ? <SendButton contractId={cid} held={held} /> : null}
                {!["completed", "voided", "declined"].includes(contract.status) ? <VoidButton contractId={cid} /> : null}
              </div>
            ) : null}
          </Card>

          {(acts ?? []).length ? (
            <Card>
              <Heading className="text-[18px]">{tc("audit")}</Heading>
              <div className="mt-2">
                {((acts ?? []) as { id: string; verb: string; summary: string; created_at: string }[]).map((a) => (
                  <Row key={a.id}>
                    <RowMain title={tc(`verb_${a.verb}`, { name: a.summary })} detail={new Date(a.created_at).toLocaleDateString(lang === "es" ? "es-ES" : "en-US")} />
                  </Row>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </WeddingShell>
  );
}
