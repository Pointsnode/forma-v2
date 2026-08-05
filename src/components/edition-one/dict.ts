"use client";
import { createContext, createElement, useContext, type JSX } from "react";
import lEn from "@/app/[locale]/landing/messages/en.json";
import lEs from "@/app/[locale]/landing/messages/es.json";
import lFr from "@/app/[locale]/landing/messages/fr.json";
import lIt from "@/app/[locale]/landing/messages/it.json";
import sEn from "./subpages.en.json";
import sEs from "./subpages.es.json";
import sFr from "./subpages.fr.json";
import sIt from "./subpages.it.json";

export type Lang = "en" | "es" | "fr" | "it";
type Dict = Record<string, string | string[]>;

// One dictionary per language: the landing's chrome + landing keys, plus the three
// subpage namespaces. Chrome strings (nav*, foot*, auth*, menu*, desk*, chip*) come from
// the landing catalogs so header/footer/menu/concierge read identically everywhere.
export const DICTS: Record<Lang, Dict> = {
  en: { ...lEn, ...sEn },
  es: { ...lEs, ...sEs },
  fr: { ...lFr, ...sFr },
  it: { ...lIt, ...sIt },
};

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
];

export type Ed1Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  s: (k: string) => string;
  menuOpen: boolean; setMenuOpen: (v: boolean) => void;
  langOpen: boolean; setLangOpen: (v: boolean) => void;
  deskOpen: boolean; setDeskOpen: (v: boolean) => void;
};

export const Ed1Context = createContext<Ed1Ctx | null>(null);
export function useEd1(): Ed1Ctx {
  const c = useContext(Ed1Context);
  if (!c) throw new Error("useEd1 must be used inside an EditionOneShell");
  return c;
}

// Render a catalog string as an element, HTML-aware (strings carry <br> and &middot;/&nbsp;
// entities, exactly as the reference does via innerHTML). Content is trusted (our catalogs).
export function T({ k, as = "span", className, style }: { k: string; as?: keyof JSX.IntrinsicElements; className?: string; style?: React.CSSProperties }) {
  const { s } = useEd1();
  return createElement(as, { className, style, dangerouslySetInnerHTML: { __html: s(k) } });
}
