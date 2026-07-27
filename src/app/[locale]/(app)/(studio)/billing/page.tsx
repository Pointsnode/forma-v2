import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, SectionTitle, Row, RowMain, Badge } from "@/components/ui";
import { stripeConfigured } from "@/lib/stripe";
import { formatMoney } from "@/lib/wedding";

// §1F: Billing — Stripe connection + planner-fee status per wedding. The only money
// that moves through Forma is the planner fee (Decision 3).
export default async function BillingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const lang = await getLocale();
  const tb = await getTranslations("billing");
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("ledger_lines")
    .select("id, wedding_id, title, amount, status, weddings(couple_display)")
    .eq("kind", "planner_fee")
    .order("due_date", { ascending: true, nullsFirst: false });
  const fees = ((rows ?? []) as unknown as { id: string; title: string; amount: number; status: string; weddings: { couple_display: string } | null }[]);

  return (
    <div>
      <SectionTitle title={tb("title")} accent={tb("hint")} className="mt-1" />

      <Card className="mb-[18px]">
        <Row>
          <RowMain title={tb("stripeTitle")} detail={stripeConfigured() ? tb("stripeOnDetail") : tb("stripeOffDetail")} />
          <Badge tone={stripeConfigured() ? "sage" : "sand"}>{stripeConfigured() ? tb("connected") : tb("testPending")}</Badge>
        </Row>
      </Card>

      <Card>
        <h3 className="mb-2 font-display text-[19px] text-ink">{tb("feesTitle")}</h3>
        {fees.length === 0 ? (
          <p className="py-6 text-center font-accent text-[15px] text-muted">{tb("empty")}</p>
        ) : (
          fees.map((f) => (
            <Row key={f.id}>
              <RowMain title={f.title} detail={f.weddings?.couple_display ?? "—"} />
              <span className="font-medium text-[13.5px] text-ink">{formatMoney(f.amount, lang) ?? "—"}</span>
              <Badge tone={["paid", "settled"].includes(f.status) ? "sage" : "wine"}>{tb(`status_${f.status}`)}</Badge>
            </Row>
          ))
        )}
      </Card>
    </div>
  );
}
