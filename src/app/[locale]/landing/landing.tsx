"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { conciergeAnswer, type ConciergeLang } from "./concierge";
import en from "./messages/en.json";
import es from "./messages/es.json";
import fr from "./messages/fr.json";
import it from "./messages/it.json";
import "./landing.ed1.css";

type Dict = Record<string, string | string[]>;
const DICTS: Record<string, Dict> = { en, es, fr, it };
const LANGS: { code: ConciergeLang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
];

// The 16-point forma star (never rotated, never beside the wordmark on one line).
const STAR =
  "M0.000,-100.000 L29.289,-70.711 L70.711,-70.711 L70.711,-29.289 L100.000,0.000 L70.711,29.289 L70.711,70.711 L29.289,70.711 L0.000,100.000 L-29.289,70.711 L-70.711,70.711 L-70.711,29.289 L-100.000,0.000 L-70.711,-29.289 L-70.711,-70.711 L-29.289,-70.711 Z";
function Star({ size, fill }: { size: number; fill: string }) {
  return (
    <svg width={size} height={size} viewBox="-105 -105 210 210" aria-hidden="true">
      <path d={STAR} fill={fill} />
    </svg>
  );
}
const CH = "#D7C3A5"; // champagne, the carousel icon stroke + dot fill

// Wordmark: lowercase, italic f. Never all caps.
const Wordmark = ({ className }: { className: string }) => (
  <span className={className}>
    <i>f</i>orma
  </span>
);

// The six service-card icons (hairline champagne), verbatim from the reference.
const ICONS: React.ReactNode[] = [
  <><path d="M10 5h14l6 6v24H10z" /><path d="M24 5v6h6" /><path d="M15 26c2-3 4-3 5-1s3 1 5-2" /><path d="M15 15h10M15 19h10" /></>,
  <><rect x="7" y="9" width="26" height="24" /><path d="M7 16h26M14 6v6M26 6v6" /><circle cx="20" cy="24" r="1" fill={CH} /><circle cx="26" cy="24" r="1" fill={CH} /><circle cx="14" cy="24" r="1" fill={CH} /><circle cx="14" cy="28.5" r="1" fill={CH} /><circle cx="20" cy="28.5" r="1" fill={CH} /></>,
  <><rect x="6" y="11" width="28" height="19" /><path d="M6 17h28" /><path d="M11 25h7" /><path d="M27 25h2" /></>,
  <><rect x="8" y="15" width="24" height="18" /><path d="M20 15v18M8 21h24" /><path d="M20 15c-6 0-8-3-7-6 1-2 5-2 7 6zM20 15c6 0 8-3 7-6-1-2-5-2-7 6z" /></>,
  <><rect x="6" y="8" width="28" height="24" /><path d="M6 14h28" /><circle cx="10" cy="11" r=".8" fill={CH} /><circle cx="14" cy="11" r=".8" fill={CH} /><path d="M13 24l4-5 4 4 3-3 3 4" /><path d="M13 28h14" /></>,
  <><path d="M10 28a10 10 0 0 1 20 0" /><path d="M7 28h26" /><path d="M7 31h26" /><path d="M20 18v-3" /><circle cx="20" cy="13" r="1.6" /></>,
];
function CardIcon({ i }: { i: number }) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke={CH} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[i]}
    </svg>
  );
}

const RIBBON = [
  { img: "glow-beauty", cap: "cap1" },
  { img: "henna-house", cap: "cap2" },
  { img: "maison-louer", cap: "cap3" },
  { img: "tavola-rentals", cap: "cap4" },
  { img: "jardin-etereo", cap: "cap5" },
];
// Six services (the endless carousel is this track duplicated once).
const SERVICES = [0, 1, 2, 3, 4, 5];
const DIRECTORY = [
  { img: "hacienda-san-gabriel", name: "Verena & Co.", meta: "San Miguel de Allende", label: "card1l", c: "c1" },
  { img: "playa-escondida", name: "Marea Bodas", meta: "Tulum · Riviera Maya", label: "card2l", c: "c2" },
  { img: "palazzo-lumia", name: "Lumia Weddings", meta: "Amalfi · Positano", label: "card3l", c: "c3" },
];

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

type Msg = { cls: string; text: string };

export function Landing({ locale }: { locale: Locale }) {
  const [lang, setLang] = useState<ConciergeLang>(locale === "es" ? "es" : "en");
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [deskOpen, setDeskOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  // Time-of-day greeting: default to "afternoon" for a deterministic SSR render, then
  // correct to the visitor's local hour on mount (avoids a hydration mismatch).
  const [hourIdx, setHourIdx] = useState(1);
  const d = DICTS[lang];
  const s = (k: string) => (d[k] as string) ?? "";
  const H = (k: string) => ({ dangerouslySetInnerHTML: { __html: s(k) } });
  const greets = (d.greets as string[]) ?? [""];
  const greeting = `${greets[hourIdx] ?? greets[0]} ${s("greetHow")}`;

  // ---- scroll choreography (imperative, rAF-throttled) ----
  const conv = useRef<HTMLElement>(null);
  const center = useRef<HTMLDivElement>(null);
  const cstar = useRef<HTMLDivElement>(null);
  const cw = useRef<HTMLDivElement>(null);
  const resolve = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const heroInner = useRef<HTMLDivElement>(null);
  const ribbon = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const tophead = useRef<HTMLElement>(null);
  const fab = useRef<HTMLButtonElement>(null);
  const caro = useRef<HTMLDivElement>(null);
  const ctrack = useRef<HTMLDivElement>(null);
  const dockedRef = useRef(false);

  // Hero load-in stagger + local-hour greeting, a tick after mount.
  useEffect(() => {
    const id = setTimeout(() => {
      setLoaded(true);
      const h = new Date().getHours();
      setHourIdx(h < 12 ? 0 : h < 18 ? 1 : 2);
    }, 60);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const starts: Record<string, [number, number]> = { planner: [-0.82, -0.62], couple: [0.82, -0.62], vendors: [-0.82, 0.62], guests: [0.82, 0.62] };
    const ends: Record<string, [number, number]> = { planner: [0, -0.34], couple: [0, 0.34], vendors: [-0.5, 0], guests: [0.5, 0] };
    // Query the words from the DOM once (matches the reference), rather than a ref-callback
    // array — no staleness, and a missing node just no-ops.
    const wordEls = conv.current ? Array.from(conv.current.querySelectorAll<HTMLElement>(".word")) : [];

    const paint = (t1: number, t2: number, t3: number, t4: number) => {
      const vw = innerWidth / 2, vh = innerHeight / 2;
      for (const w of wordEls) {
        const side = w.dataset.side;
        if (!side || !starts[side]) continue;
        const st = starts[side], e = ends[side];
        const x = (st[0] + (e[0] - st[0]) * t1) * vw;
        const y = (st[1] + (e[1] - st[1]) * t1) * vh;
        w.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${1 - 0.34 * t2})`;
        w.style.opacity = String((1 - 0.45 * t2) * (1 - t4));
        w.style.color = t2 > 0.5 ? "#8A7557" : "#111111";
      }
      if (resolve.current) resolve.current.style.opacity = String(t3 * (1 - t4));
      const c = center.current, cwEl = cw.current;
      if (c && cwEl) {
        const centerH = c.offsetHeight;
        const originY = cwEl.offsetTop + cwEl.offsetHeight / 2;
        const baseY = vh - centerH / 2 + originY;
        // MEASURED dock target: the header wordmark's own center (not a hardcoded 27/30).
        // Queried off the fixed header (opacity:0 but laid out), so the docked stage
        // wordmark lands exactly on it.
        const hRect = tophead.current?.querySelector(".cwm")?.getBoundingClientRect();
        const targetY = hRect ? hRect.top + hRect.height / 2 : 30;
        const ty = (targetY - baseY) * t4;
        const scale = 1 - (1 - 23 / 44) * t4;
        c.style.opacity = String(t2);
        c.style.transformOrigin = `50% ${originY}px`;
        c.style.transform = `translate(-50%,-50%) translateY(${ty}px) scale(${t4 > 0 ? scale : 0.9 + 0.1 * t2})`;
        if (cstar.current) cstar.current.style.opacity = String(1 - clamp(t4 * 2.2, 0, 1));
        c.style.visibility = t4 >= 1 ? "hidden" : "visible";
      }
    };

    const setChrome = (docked: boolean) => {
      tophead.current?.classList.toggle("on", docked);
      fab.current?.classList.toggle("on", docked);
      if (dockedRef.current && !docked) setDeskOpen(false);
      dockedRef.current = docked;
    };

    if (reduce) {
      // Static settled composition: words in the cross, lockup + resolution shown, chrome on.
      paint(1, 1, 1, 0);
      setChrome(true);
      return;
    }

    let raf = 0;
    const frame = () => {
      const el = conv.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const total = el.offsetHeight - innerHeight;
        if (total <= 0) { setChrome(true); }
        else {
          const p = clamp(-rect.top / total, 0, 1);
          const t1 = ease(clamp(p / 0.5, 0, 1));
          const t2 = clamp((p - 0.5) / 0.18, 0, 1);
          const t3 = clamp((p - 0.64) / 0.16, 0, 1);
          const t4 = ease(clamp((p - 0.84) / 0.16, 0, 1));
          paint(t1, t2, t3, t4);
          setChrome(t4 >= 1);
        }
      }
      // hero parallax + ribbon drift
      const h = hero.current, hi = heroInner.current;
      if (h && hi) {
        const y = scrollY, hh = h.offsetHeight;
        if (y < hh) { const t = y / hh; hi.style.transform = `translateY(${y * 0.32}px)`; hi.style.opacity = String(1 - t * 1.15); }
      }
      const rb = ribbon.current, tr = track.current;
      if (rb && tr) {
        const r = rb.getBoundingClientRect();
        const span = innerHeight + r.height;
        const pr = clamp((innerHeight - r.top) / span, 0, 1);
        const over = tr.scrollWidth - innerWidth;
        tr.style.transform = `translateX(${-over * pr + innerWidth * 0.06 * (1 - pr) - innerWidth * 0.03}px)`;
      }
    };
    // Reset the throttle flag BEFORE the work and catch any throw (dev-logged, not
    // swallowed): a single mid-frame exception must never brick the whole scene.
    const tick = () => {
      raf = 0;
      try { frame(); } catch (e) { if (process.env.NODE_ENV !== "production") console.error("[landing scroll frame]", e); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    frame();
    return () => { removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  // ---- services carousel: user-driven, endless, flick momentum + soft settle ----
  // Faithful to the rev-3 reference: no autoplay, no CSS scroll-snap. Native scroll for
  // touch/trackpad (with a quiet-period settle on top); mouse drag with pointer capture,
  // 1:1 tracking, sampled velocity, and a fling that decays 5%/frame then eases the
  // nearest card to dead center. The tripled track repositions invisibly for endlessness.
  useEffect(() => {
    const caroEl = caro.current, ctrackEl = ctrack.current;
    if (!caroEl || !ctrackEl) return;
    const caps = () => [...ctrackEl.children] as HTMLElement[];
    let oneSet = 0, animRAF: number | null = null, driving = false;
    let dragX: number | null = null, dragSL = 0, lastX = 0, vel = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const caroLayout = () => {
      // Center on the true viewport center (innerWidth/2), derived via the container's own
      // rect so a window scrollbar can't offset it. Card centers stay offsetLeft-based
      // (scale-independent); only the unscaled container uses getBoundingClientRect.
      const mid = caroEl.scrollLeft + innerWidth / 2 - caroEl.getBoundingClientRect().left;
      for (const c of caps()) {
        const cc = c.offsetLeft + c.offsetWidth / 2;
        const t = Math.min(1, Math.abs(cc - mid) / (c.offsetWidth * 1.2));
        c.style.transform = `scale(${(1 - 0.231 * t).toFixed(3)})`; // center 1.0, neighbors ~0.77 (30% larger center)
        c.style.opacity = String(1 - 0.28 * t);
      }
      if (oneSet > 0) {
        if (caroEl.scrollLeft < oneSet * 0.5) caroEl.scrollLeft += oneSet;
        else if (caroEl.scrollLeft > oneSet * 1.5) caroEl.scrollLeft -= oneSet;
      }
    };
    const caroInit = () => {
      oneSet = ctrackEl.scrollWidth / 3;
      caroEl.scrollLeft = oneSet + oneSet / 6 / 2 - caroEl.clientWidth / 2 + (oneSet / 6) * 1.5;
      caroLayout();
    };
    const cancelAnim = () => { if (animRAF) cancelAnimationFrame(animRAF); animRAF = null; driving = false; };
    const nearestDelta = () => {
      // Center on the true viewport center (innerWidth/2), derived via the container's own
      // rect so a window scrollbar can't offset it. Card centers stay offsetLeft-based
      // (scale-independent); only the unscaled container uses getBoundingClientRect.
      const mid = caroEl.scrollLeft + innerWidth / 2 - caroEl.getBoundingClientRect().left;
      let best = 1e9, delta = 0;
      for (const c of caps()) { const dd = c.offsetLeft + c.offsetWidth / 2 - mid; if (Math.abs(dd) < Math.abs(best)) { best = dd; delta = dd; } }
      return delta;
    };
    const settle = () => {
      cancelAnim();
      const step = () => {
        const dd = nearestDelta();
        if (Math.abs(dd) < 0.75) { cancelAnim(); caroLayout(); return; }
        driving = true;
        caroEl.scrollLeft += dd > 0 ? Math.max(0.6, dd * 0.06) : Math.min(-0.6, dd * 0.06);
        caroLayout();
        animRAF = requestAnimationFrame(step);
      };
      animRAF = requestAnimationFrame(step);
    };
    const fling = () => {
      cancelAnim();
      const step = () => {
        if (Math.abs(vel) < 1.1) { settle(); return; }
        driving = true;
        caroEl.scrollLeft -= vel;
        vel *= 0.95;
        caroLayout();
        animRAF = requestAnimationFrame(step);
      };
      animRAF = requestAnimationFrame(step);
    };
    const onScroll = () => {
      requestAnimationFrame(caroLayout);
      if (driving || dragX !== null) return;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => { if (!driving && dragX === null) settle(); }, 160);
    };
    const onDown = (e: PointerEvent) => {
      cancelAnim();
      if (e.pointerType !== "mouse") return;
      dragX = e.clientX; lastX = e.clientX; dragSL = caroEl.scrollLeft; vel = 0;
      caroEl.classList.add("dragging"); caroEl.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (dragX === null) return;
      caroEl.scrollLeft = dragSL - (e.clientX - dragX);
      vel = (e.clientX - lastX) * 0.8 + vel * 0.2;
      lastX = e.clientX;
    };
    const onUp = () => { if (dragX === null) return; dragX = null; caroEl.classList.remove("dragging"); fling(); };

    const initTimer = setTimeout(caroInit, 120);
    addEventListener("resize", caroInit);
    caroEl.addEventListener("scroll", onScroll, { passive: true });
    caroEl.addEventListener("pointerdown", onDown);
    caroEl.addEventListener("pointermove", onMove);
    caroEl.addEventListener("pointerup", onUp);
    caroEl.addEventListener("pointercancel", onUp);
    return () => {
      clearTimeout(initTimer); if (settleTimer) clearTimeout(settleTimer); cancelAnim();
      removeEventListener("resize", caroInit);
      caroEl.removeEventListener("scroll", onScroll);
      caroEl.removeEventListener("pointerdown", onDown);
      caroEl.removeEventListener("pointermove", onMove);
      caroEl.removeEventListener("pointerup", onUp);
      caroEl.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // ---- concierge ----
  function ask(q: string) {
    setMsgs((m) => [...m, { cls: "me", text: q }, { cls: "them wait", text: "· · ·" }]);
    const reply = conciergeAnswer(q, lang);
    setTimeout(() => setMsgs((m) => { const n = [...m]; n[n.length - 1] = { cls: "them", text: reply }; return n; }), 850);
  }
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "nearest" }); }, [msgs]);

  const chips = [
    { q: "What does forma cost?", k: "chip1" },
    { q: "What can the concierge do?", k: "chip2" },
    { q: "Can forma handle a three city wedding?", k: "chip3" },
    { q: "What languages does forma speak?", k: "chip4" },
  ];

  return (
    <div className="ed1" lang={lang}>
      {/* fixed header (post-dock) */}
      <header className="tophead" ref={tophead}>
        <button className="burger" aria-label="Menu" onClick={() => setMenuOpen(true)}><span /><span /><span /></button>
        <Link className="cwm" href="/sign-up"><i>f</i>orma</Link>
        <div className="auth">
          <Link className="in" href="/sign-in" {...H("authLogin")} />
          <Link className="up" href="/sign-up" {...H("authSignup")} />
        </div>
      </header>

      {/* full-screen menu */}
      <div className={`menuovl${menuOpen ? " open" : ""}`}>
        <button className="x" onClick={() => setMenuOpen(false)} {...H("menuClose")} />
        <div>
          <Link href="/about" {...H("menuAbout")} />
          <Link href="/pricing" {...H("menuPricing")} />
          <Link href="/atelier" {...H("navAtelier")} />
          <div className="small"><Link href="/sign-in" {...H("authLogin")} /><Link href="/sign-up" {...H("authSignup")} /></div>
        </div>
      </div>

      {/* concierge floater + desk */}
      <button className="fab" aria-label={s("deskT")} ref={fab} onClick={() => setDeskOpen((v) => !v)}>
        <Star size={24} fill="#F5F2EB" />
      </button>
      <div className={`deskpanel${deskOpen ? " open" : ""}`}>
        <div className="deskhead">
          <Star size={18} fill="#111111" />
          <div className="t" {...H("deskT")} />
          <div className="g">{greeting}</div>
        </div>
        <div className="chat">
          {msgs.map((m, i) => <div key={i} className={`msg ${m.cls}`}>{m.text}</div>)}
          <div ref={chatEnd} />
        </div>
        <div className="chips">
          {chips.map((c) => <button key={c.k} onClick={() => ask(c.q)} {...H(c.k)} />)}
        </div>
        <form className="askrow" onSubmit={(e) => { e.preventDefault(); const inp = e.currentTarget.elements.namedItem("q") as HTMLInputElement; if (inp.value.trim()) { ask(inp.value.trim()); inp.value = ""; } }}>
          <input name="q" type="text" placeholder={s("askPh")} autoComplete="off" />
          <button type="submit" {...H("askBtn")} />
        </form>
      </div>

      {/* transparent hero nav */}
      <nav>
        <Wordmark className="wordmark" />
        <div className="links">
          <Link className="nl" href="/atelier" {...H("navAtelier")} />
          <Link className="nl" href="/pricing" {...H("navPricing")} />
          <Link className="nl" href="/sign-in" {...H("navSignin")} />
          <Link className="cta" href="/sign-up" {...H("navCta")} />
        </div>
      </nav>

      {/* hero */}
      <section className="hero" ref={hero}>
        <div className="inner" ref={heroInner}>
          <div className={`li${loaded ? " in" : ""}`}><Star size={32} fill="#F5F2EB" /></div>
          <div className={`kick li${loaded ? " in" : ""}`} style={{ transitionDelay: ".15s" }} {...H("heroKick")} />
          <h1 className={`li${loaded ? " in" : ""}`} style={{ transitionDelay: ".3s" }} {...H("heroH1")} />
          <div className={`sub li${loaded ? " in" : ""}`} style={{ transitionDelay: ".5s" }} {...H("heroSub")} />
        </div>
        <div className={`hint li${loaded ? " in" : ""}`} style={{ transitionDelay: ".9s" }} {...H("heroHint")} />
      </section>

      {/* the convergence */}
      <section className="conv" ref={conv}>
        <div className="stage">
          {(["planner", "couple", "vendors", "guests"] as const).map((side) => (
            <div key={side} className="word" data-side={side} {...H(`w${side[0].toUpperCase()}${side.slice(1)}`)} />
          ))}
          <div className="center" ref={center}>
            <div className="cstar" ref={cstar}><Star size={40} fill="#111111" /></div>
            <div className="cw" ref={cw}><i>f</i>orma</div>
          </div>
          <div className="resolve" ref={resolve}>
            <div className="r1" {...H("resolve1")} />
          </div>
        </div>
      </section>

      {/* photo ribbon */}
      <section className="ribbon" ref={ribbon}>
        <div className="lead">
          <Star size={24} fill="#111111" />
          <div className="q" {...H("ribbonQ")} />
        </div>
        <div className="track" ref={track}>
          {RIBBON.map((r) => (
            <figure key={r.img}>
              <div className="imgwrap"><Image src={`/landing/${r.img}.jpg`} alt="" fill sizes="440px" style={{ objectFit: "cover" }} loading="lazy" /></div>
              <figcaption {...H(r.cap)} />
            </figure>
          ))}
        </div>
      </section>

      {/* the four, one line each */}
      <section className="four">
        {[1, 2, 3, 4].map((n) => (
          <div className="row" key={n}>
            <div className="who"><Star size={13} fill="#8A7557" /><span {...H(`row${n}w`)} /></div>
            <div className="what" {...H(`row${n}d`)} />
          </div>
        ))}
      </section>

      {/* native services carousel */}
      <section className="inside">
        <div className="wrap">
          <div className="head">
            <Star size={22} fill="#D7C3A5" />
            <h2 {...H("insideH2")} />
          </div>
          <div className="caro" ref={caro}><div className="ctrack" ref={ctrack}>
            {[0, 1, 2].flatMap((dup) => SERVICES.map((i) => (
              <div className="cap" key={`${dup}-${i}`}>
                <div className="shot"><span>forma</span></div>
                <CardIcon i={i} />
                <div className="nm" {...H(`s${i + 1}n`)} />
                <div className="d" {...H(`s${i + 1}d`)} />
              </div>
            )))}
          </div></div>
          <div className="after"><Link className="go" href="/sign-up" {...H("atelierGo")} /></div>
        </div>
      </section>

      {/* oxblood close */}
      <section className="close">
        <Star size={34} fill="#6E353B" />
        <h2 {...H("closeH2")} />
        <Link className="cta" href="/sign-up" {...H("navCta")} />
      </section>

      {/* directory showcase (illustrative studios, not real listings) */}
      <section className="dirstrip">
        <div className="inner">
          <div>
            <div className="kick"><Star size={12} fill="#8A7557" /><span {...H("dirKick")} /></div>
            <h2 {...H("dirH2")} />
            <p {...H("dirP")} />
            <Link className="go2" href="/planners" {...H("dirGo")} />
          </div>
          <div className="dcards">
            {DIRECTORY.map((c) => (
              <Link className={`dcard ${c.c}`} href="/planners" key={c.img}>
                <div className="imgwrap"><Image src={`/landing/${c.img}-640.jpg`} alt="" fill sizes="(max-width:900px) 50vw, 320px" style={{ objectFit: "cover" }} loading="lazy" /></div>
                <div className="b">
                  <div className="n">{c.name}</div>
                  <div className="m">{c.meta}</div>
                  <div className="l" {...H(c.label)} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* footer */}
      <footer>
        <Star size={16} fill="#F5F2EB" /><br />
        <Wordmark className="wordmark" />
        <div className="row2">
          <Link href="/atelier" {...H("navAtelier")} />
          <Link href="/pricing" {...H("navPricing")} />
          <Link href="/about" {...H("menuAbout")} />
          <Link href="/planners" {...H("footDirectory")} />
          <button type="button" onClick={() => setLangOpen((v) => !v)} {...H("footLanguage")} />
          <Link href="/sign-in" {...H("navSignin")} />
        </div>
        <div className="fine" {...H("footFine")} />
      </footer>

      {/* language menu */}
      <div className={`langmenu${langOpen ? " open" : ""}`}>
        {LANGS.map((l) => (
          <button key={l.code} className={l.code === lang ? "cur" : ""} onClick={() => { setLang(l.code); setLangOpen(false); }}>{l.label}</button>
        ))}
      </div>
    </div>
  );
}
