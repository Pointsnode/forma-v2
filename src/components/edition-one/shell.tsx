"use client";
import { useState, type ReactNode } from "react";
import { Ed1Context, DICTS, type Lang } from "./dict";
import { Header, Footer, BurgerMenu, LangMenu } from "./chrome";
import { ConciergeFloater } from "./concierge-desk";
import "@/app/[locale]/landing/landing.ed1.css"; // .ed1 base + shared chrome (tophead/footer/menu/langmenu/deskpanel/fab)
import "./subpages.css"; // subpage page classes + the .ed1.subpage static-chrome overrides

// The Edition One shell for the subpages. Holds the language + menu/desk state, provides
// them to the shared chrome via context, and renders the static header, the page content,
// the footer, the full-screen menu, the language menu and the always-on concierge floater.
// One chrome, one concierge, three doors (the landing is the fourth, with its own docking).
export function EditionOneShell({ locale, children }: { locale: string; children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(locale === "es" ? "es" : "en");
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [deskOpen, setDeskOpen] = useState(false);
  const s = (k: string) => {
    const v = DICTS[lang][k];
    return typeof v === "string" ? v : (v as unknown as string) ?? "";
  };
  return (
    <Ed1Context.Provider value={{ lang, setLang, s, menuOpen, setMenuOpen, langOpen, setLangOpen, deskOpen, setDeskOpen }}>
      <div className="ed1 subpage" lang={lang}>
        <Header />
        {children}
        <Footer />
        <BurgerMenu />
        <LangMenu />
        <ConciergeFloater />
      </div>
    </Ed1Context.Provider>
  );
}
