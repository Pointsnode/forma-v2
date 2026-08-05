"use client";
import { Link } from "@/i18n/navigation";
import { Star } from "@/components/edition-one/star";
import { T, useEd1 } from "@/components/edition-one/dict";

// Pricing. Dollar figures are typographic (Playfair, raised $), the same in every locale;
// the prose that mentions figures (e.g. "$128") comes from the catalogs per language.
export function PricingContent() {
  const { s } = useEd1();
  // Locked model (2026-08-05): $89 first account, $49 each additional, $49 per additional
  // fifty weddings past the team cap. Everything — the concierge included — is in every plan.
  const prices = [
    { amt: "89", who: "pricing.p1.who", note: "pricing.p1.note" },
    { amt: "49", who: "pricing.p2.who", note: "pricing.p2.note" },
    { amt: "49", who: "pricing.p3.who", note: "pricing.p3.note" },
  ];
  return (
    <>
      <section className="pagehead">
        <Star size={28} fill="#111111" />
        <div className="kick" style={{ marginTop: 22 }}>{s("pricing.kicker")}</div>
        <T k="pricing.h1" as="h1" />
        <T k="pricing.sub" as="p" />
      </section>
      <main>
        <div className="prices">
          {prices.map((p) => (
            <div className="price" key={p.amt}>
              <div className="amt"><span>$</span>{p.amt}</div>
              <T k={p.who} as="div" className="who" />
              <T k={p.note} as="div" className="note" />
            </div>
          ))}
        </div>
        <T k="pricing.capnote" as="div" className="capnote" />
        <T k="pricing.trial" as="div" className="trial" />

        <section className="included">
          <Star size={20} fill="#111111" />
          <T k="pricing.inc.h2" as="h2" style={{ marginTop: 20 }} />
          <div className="inc">
            {/* i12 (the AI concierge) renders right after i1, then the rest in order. */}
            {[1, 12, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => (
              <span key={n}><Star size={10} fill="#8A7557" />{s(`pricing.inc.i${n}`)}</span>
            ))}
          </div>
        </section>

        <section className="faq">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div className="qa" key={i}>
              <T k={`pricing.q${i}`} as="div" className="q" />
              <T k={`pricing.a${i}`} as="div" className="a" />
            </div>
          ))}
        </section>
      </main>
      <section className="close">
        <Star size={30} fill="#6E353B" />
        <T k="pricing.close.h2" as="h2" />
        <Link className="cta" href="/sign-up">{s("navCta")}</Link>
      </section>
    </>
  );
}
