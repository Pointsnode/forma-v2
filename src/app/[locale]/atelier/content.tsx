"use client";
import { Link } from "@/i18n/navigation";
import { Star } from "@/components/edition-one/star";
import { T, useEd1 } from "@/components/edition-one/dict";

// Mock sheets are illustrative artwork (fictional couples, no live data, no DB reads).
// Their interior strings stay English in all locales (they are pictures of the product;
// phase 2 replaces them with real portal screenshots). Only the copy columns, headings,
// table labels, fine print and close translate.

function Bar({ label }: { label: string }) {
  return <div className="sheetbar"><Star size={9} fill="#8A7557" /><span>{label}</span></div>;
}

const SHEETS: Record<number, React.ReactNode> = {
  1: (
    <div className="sheet">
      <Bar label="Inquiry to booked" />
      <div className="steps">
        <div className="st"><div className="n">01</div><div className="t">Proposal</div><div className="d">Presented Tuesday. Viewed twice.</div></div>
        <div className="st"><div className="n">02</div><div className="t">Contract</div><div className="d">Signed by both, Thursday 9:12.</div></div>
        <div className="st"><div className="n">03</div><div className="t">Deposit</div><div className="d"><span className="chip teal">Paid</span></div></div>
      </div>
    </div>
  ),
  2: (
    <div className="sheet">
      <Bar label="Vendor ledger" />
      <div className="pad" style={{ paddingTop: 8, paddingBottom: 12 }}>
        <div className="row"><span>Viñedo Santa Elena</span><span className="m">Venue</span><span>$24,000</span><span className="chip teal">Paid</span></div>
        <div className="row"><span>Flor y Canto</span><span className="m">Florals</span><span>$3,700</span><span className="chip teal">Booked</span></div>
        <div className="row"><span>Luz Films</span><span className="m">Photo</span><span>$5,200</span><span className="chip line">Deposit due</span></div>
        <div className="row"><span>Mariachi Los Reyes</span><span className="m">Music</span><span>$1,800</span><span className="chip line">Quoted</span></div>
      </div>
    </div>
  ),
  3: (
    <div className="phone">
      <Bar label="Couple portal" />
      <div className="screen">
        <div style={{ fontFamily: "var(--font-playfair), Georgia, serif", fontSize: 20, color: "#111111" }}>Amelia &amp; Rafael</div>
        <div style={{ fontSize: 10.5, letterSpacing: ".2em", color: "#8A7557", margin: "6px 0 14px" }}>OCTOBER 17 · 74 DAYS</div>
        <div style={{ fontSize: 12, color: "#6B655B" }}>Budget</div>
        <div className="bar"><div className="fill" /></div>
        <div style={{ fontSize: 12, color: "#6B655B", marginBottom: 14 }}>$38,400 of $62,000 committed</div>
        <div className="row"><span style={{ fontSize: 13 }}>Approve the menu</span><span className="chip teal">Open</span></div>
        <div className="row"><span style={{ fontSize: 13 }}>Song requests close</span><span className="m">Friday</span></div>
      </div>
    </div>
  ),
  4: (
    <div className="sheet">
      <Bar label="Seating · 214 confirmed" />
      <div className="pad" style={{ paddingTop: 8, paddingBottom: 12 }}>
        <div className="row"><span>RSVP received</span><span className="m">214 of 230</span><span className="chip teal">93%</span></div>
        <div className="row"><span>Meals chosen</span><span className="m">Fish 84 · Beef 71 · Garden 59</span></div>
        <div className="row"><span>Tables seated</span><span className="m">11 of 11</span><span className="chip teal">Done</span></div>
        <div className="row"><span>Day-of schedule sent</span><span className="m">To every pocket</span></div>
      </div>
    </div>
  ),
  5: (
    <div className="sheet">
      <Bar label="Run of show · Saturday" />
      <div className="pad" style={{ paddingTop: 8 }}>
        <div className="row"><span>Ceremony</span><span className="m">Terrace</span><span>4:30</span></div>
        <div className="row" style={{ background: "#2F5552", color: "#F5F2EB", paddingLeft: 12, paddingRight: 12, borderBottom: "none" }}><span>Cocktails</span><span style={{ opacity: .8 }}>Olive court</span><span>5:15</span></div>
        <div className="row"><span>Dinner</span><span className="m">Long table</span><span>6:45</span></div>
        <div className="row"><span>First dance</span><span className="m">Dancefloor</span><span>8:30</span></div>
        <div style={{ marginTop: 16 }}><span className="btn">Send to vendors</span></div>
      </div>
    </div>
  ),
  6: (
    <div className="cards">
      {[
        ["Amelia & Rafael", "Oct 17", true, "paid in full"],
        ["Priya & Arjun", "Nov 8", true, "2 signatures out"],
        ["Sofia & Marco", "Nov 29", false, "Watching · quote due Fri"],
        ["June & Tom", "Feb 14", true, "design phase"],
        ["Ana & Diego", "Mar 21", true, "venue booked"],
        ["Claire & Hugo", "May 9", false, "New · proposal drafting"],
      ].map(([nm, dt, ok, tail]) => (
        <div className="wcard" key={nm as string}>
          <div className="nm">{nm}</div>
          <div className="dt">{dt}</div>
          <div className="st">{ok ? <><span className="ok">On track</span> · {tail}</> : (tail as string)}</div>
        </div>
      ))}
    </div>
  ),
};

// The comparison table. Each cell is a charcoal forma star, a muted competitor star, or a
// text label from the catalog (muted when it is a partial/absent feature). Do not add,
// remove or reword any row or cell.
type Cell = "star" | { t: string; muted?: boolean };
const ROWS: [string, Cell, Cell, Cell][] = [
  ["atelier.cmp.r1", "star", "star", "star"],
  ["atelier.cmp.r2", "star", "star", "star"],
  ["atelier.cmp.r3", "star", { t: "atelier.cmp.no", muted: true }, "star"],
  ["atelier.cmp.r4", "star", { t: "atelier.cmp.no", muted: true }, "star"],
  ["atelier.cmp.r5", "star", { t: "atelier.cmp.no", muted: true }, "star"],
  ["atelier.cmp.r6", "star", { t: "atelier.cmp.no", muted: true }, "star"],
  ["atelier.cmp.r7", "star", { t: "atelier.cmp.no", muted: true }, "star"],
  ["atelier.cmp.r8", "star", { t: "atelier.cmp.no", muted: true }, "star"],
  ["atelier.cmp.r9", "star", { t: "atelier.cmp.adminOnly", muted: true }, { t: "atelier.cmp.no", muted: true }],
  ["atelier.cmp.r10", { t: "atelier.cmp.four" }, { t: "atelier.cmp.english", muted: true }, { t: "atelier.cmp.english", muted: true }],
  ["atelier.cmp.r11", { t: "atelier.cmp.design", muted: true }, { t: "atelier.cmp.no", muted: true }, "star"],
  ["atelier.cmp.r12", { t: "atelier.cmp.app", muted: true }, "star", { t: "atelier.cmp.no", muted: true }],
  ["atelier.cmp.r13", { t: "atelier.cmp.growing", muted: true }, { t: "atelier.cmp.no", muted: true }, "star"],
];

export function AtelierContent() {
  const { s } = useEd1();
  const scenes = [1, 2, 3, 4, 5, 6];
  const cell = (c: Cell, col: number) => {
    if (c === "star") return <Star size={12} fill={col === 0 ? "#111111" : "#6B655B"} />;
    return c.muted ? <span className="no">{s(c.t)}</span> : s(c.t);
  };
  return (
    <>
      <section className="pagehead">
        <Star size={28} fill="#111111" />
        <div className="kick" style={{ marginTop: 22 }}>{s("atelier.kicker")}</div>
        <T k="atelier.h1" as="h1" />
        <T k="atelier.sub" as="p" />
      </section>

      <main>
        {scenes.map((n) => {
          const flip = n % 2 === 0;
          return (
            <section className={`scene${flip ? " flip" : ""}`} style={n === 1 ? { borderTop: "none" } : undefined} key={n}>
              <div className="copy">
                <div className="kick">{s(`atelier.s${n}.kick`)}</div>
                <T k={`atelier.s${n}.h2`} as="h2" />
                <T k={`atelier.s${n}.p`} as="p" />
              </div>
              <div className="show">{SHEETS[n]}</div>
            </section>
          );
        })}

        <section className="compare">
          <div className="head">
            <Star size={22} fill="#111111" />
            <T k="atelier.cmp.h2" as="h2" />
            <T k="atelier.cmp.sub" as="p" />
          </div>
          <table>
            <tbody>
              <tr><th /><th className="f">forma</th><th>HoneyBook</th><th>Aisle Planner</th></tr>
              {ROWS.map(([label, f, hb, ap]) => (
                <tr key={label}>
                  <td>{s(label)}</td>
                  <td>{cell(f, 0)}</td>
                  <td>{cell(hb, 1)}</td>
                  <td>{cell(ap, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <T k="atelier.cmp.fine" as="div" className="fine" />
        </section>
      </main>

      <section className="close">
        <Star size={30} fill="#6E353B" />
        <T k="atelier.close.h2" as="h2" />
        <Link className="cta" href="/sign-up">{s("navCta")}</Link>
      </section>
    </>
  );
}
