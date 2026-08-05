"use client";
import { useEffect, useRef, useState } from "react";
import { Star } from "./star";
import { useEd1 } from "./dict";
import { conciergeAnswer } from "@/app/[locale]/landing/concierge";

type Msg = { cls: string; text: string };

// The concierge floater (square charcoal tile) + desk. Same panel, chips and scripted KB
// as the landing: one concierge, four doors. On subpages the floater is always visible
// (CSS via .ed1.subpage); on the landing its visibility is docking-driven.
export function ConciergeFloater() {
  const { s, lang, deskOpen, setDeskOpen } = useEd1();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hourIdx, setHourIdx] = useState(1); // afternoon default for a deterministic SSR
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      const h = new Date().getHours();
      setHourIdx(h < 12 ? 0 : h < 18 ? 1 : 2);
    }, 0);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);

  const greets = (s("greets") as unknown as string[]) ?? [""];
  const greetsArr = Array.isArray(greets) ? greets : [String(greets)];
  const greeting = `${greetsArr[hourIdx] ?? greetsArr[0]} ${s("greetHow")}`;

  function ask(q: string) {
    setMsgs((m) => [...m, { cls: "me", text: q }, { cls: "them wait", text: "· · ·" }]);
    const reply = conciergeAnswer(q, lang);
    setTimeout(() => setMsgs((m) => { const n = [...m]; n[n.length - 1] = { cls: "them", text: reply }; return n; }), 850);
  }

  const chips = [
    { q: "What does forma cost?", k: "chip1" },
    { q: "What can the concierge do?", k: "chip2" },
    { q: "Can forma handle a three city wedding?", k: "chip3" },
    { q: "What languages does forma speak?", k: "chip4" },
  ];

  return (
    <>
      <button className="fab" aria-label={s("deskT")} onClick={() => setDeskOpen(!deskOpen)}>
        <Star size={24} fill="#F5F2EB" />
      </button>
      <div className={`deskpanel${deskOpen ? " open" : ""}`}>
        <div className="deskhead">
          <Star size={18} fill="#111111" />
          <div className="t">{s("deskT")}</div>
          <div className="g">{greeting}</div>
        </div>
        <div className="chat">
          {msgs.map((m, i) => <div key={i} className={`msg ${m.cls}`}>{m.text}</div>)}
          <div ref={chatEnd} />
        </div>
        <div className="chips">
          {chips.map((c) => <button key={c.k} onClick={() => ask(c.q)}>{s(c.k)}</button>)}
        </div>
        <form className="askrow" onSubmit={(e) => { e.preventDefault(); const inp = e.currentTarget.elements.namedItem("q") as HTMLInputElement; if (inp.value.trim()) { ask(inp.value.trim()); inp.value = ""; } }}>
          <input name="q" type="text" placeholder={s("askPh")} autoComplete="off" />
          <button type="submit">{s("askBtn")}</button>
        </form>
      </div>
    </>
  );
}
