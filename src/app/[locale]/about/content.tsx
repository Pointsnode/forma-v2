"use client";
import { Link } from "@/i18n/navigation";
import { Star } from "@/components/edition-one/star";
import { T, useEd1 } from "@/components/edition-one/dict";

export function AboutContent() {
  const { s } = useEd1();
  return (
    <>
      <section className="pagehead">
        <Star size={28} fill="#111111" />
        <div className="kick" style={{ marginTop: 22 }}>{s("about.kicker")}</div>
        <T k="about.h1" as="h1" />
        <T k="about.sub" as="p" />
      </section>

      <section className="envelope">
        <div className="in2">
          <Star size={24} fill="#D7C3A5" />
          <T k="about.env.h2" as="h2" />
          <T k="about.env.p" as="p" />
        </div>
      </section>

      <section className="principles">
        {[1, 2, 3, 4].map((i) => (
          <div className="rowp" key={i}>
            <div className="who"><Star size={12} fill="#8A7557" />{s(`about.pr${i}.name`)}</div>
            <T k={`about.pr${i}.text`} as="div" className="what" />
          </div>
        ))}
      </section>

      <section className="close" style={{ marginTop: 0 }}>
        <Star size={30} fill="#6E353B" />
        <T k="about.close.h2" as="h2" />
        <Link className="cta" href="/sign-up">{s("navCta")}</Link>
      </section>
    </>
  );
}
