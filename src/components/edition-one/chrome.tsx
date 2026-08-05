"use client";
import { Link } from "@/i18n/navigation";
import { Star, Wordmark } from "./star";
import { useEd1, LANGS } from "./dict";

// Sticky bone header: burger (opens the full-screen menu), centered wordmark to the
// landing, Log in / Sign up. On subpages it is sticky-from-load (CSS via .ed1.subpage).
export function Header() {
  const { s, setMenuOpen } = useEd1();
  return (
    <header className="tophead">
      <button className="burger" aria-label="Menu" onClick={() => setMenuOpen(true)}><span /><span /><span /></button>
      <Link className="cwm" href="/"><Wordmark /></Link>
      <div className="auth">
        <Link className="in" href="/sign-in">{s("authLogin")}</Link>
        <Link className="up" href="/sign-up">{s("authSignup")}</Link>
      </div>
    </header>
  );
}

// Charcoal signed footer, shared by all four pages: star over wordmark, one link row
// (The atelier, Pricing, About, Directory, Language, Sign in), fine print.
export function Footer() {
  const { s, setLangOpen } = useEd1();
  return (
    <footer>
      <Star size={16} fill="#F5F2EB" /><br />
      <Link className="cwm" href="/"><Wordmark /></Link>
      <div className="row2">
        <Link href="/atelier">{s("navAtelier")}</Link>
        <Link href="/pricing">{s("navPricing")}</Link>
        <Link href="/about">{s("menuAbout")}</Link>
        <Link href="/planners">{s("footDirectory")}</Link>
        <button type="button" onClick={() => setLangOpen(true)}>{s("footLanguage")}</button>
        <Link href="/sign-in">{s("navSignin")}</Link>
      </div>
      <div className="fine" dangerouslySetInnerHTML={{ __html: s("footFine") }} />
    </footer>
  );
}

// Full-screen charcoal menu: About, Pricing, The atelier, then Log in / Sign up.
export function BurgerMenu() {
  const { s, menuOpen, setMenuOpen } = useEd1();
  return (
    <div className={`menuovl${menuOpen ? " open" : ""}`}>
      <button className="x" onClick={() => setMenuOpen(false)}>{s("menuClose")}</button>
      <div>
        <Link href="/about" onClick={() => setMenuOpen(false)}>{s("menuAbout")}</Link>
        <Link href="/pricing" onClick={() => setMenuOpen(false)}>{s("menuPricing")}</Link>
        <Link href="/atelier" onClick={() => setMenuOpen(false)}>{s("navAtelier")}</Link>
        <div className="small">
          <Link href="/sign-in" onClick={() => setMenuOpen(false)}>{s("authLogin")}</Link>
          <Link href="/sign-up" onClick={() => setMenuOpen(false)}>{s("authSignup")}</Link>
        </div>
      </div>
    </div>
  );
}

// Language menu: switches the client locale in place, no reload.
export function LangMenu() {
  const { lang, setLang, langOpen, setLangOpen } = useEd1();
  return (
    <div className={`langmenu${langOpen ? " open" : ""}`}>
      {LANGS.map((l) => (
        <button key={l.code} className={l.code === lang ? "cur" : ""} onClick={() => { setLang(l.code); setLangOpen(false); }}>{l.label}</button>
      ))}
    </div>
  );
}
