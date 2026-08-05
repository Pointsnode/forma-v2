import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Playfair_Display, Inter, Cormorant_Garamond, Instrument_Sans } from "next/font/google";
import localFont from "next/font/local";
import { routing } from "@/i18n/routing";
import "../globals.css";

// The app keeps its current faces (Playfair/Inter/Cormorant drive the global
// --font-display/-sans/-accent tokens, unchanged). The brand faces below load GLOBALLY
// so their CSS variables exist everywhere, but only the landing's .brand scope remaps
// the tokens onto them — so no studio surface changes (M17-brand resolution 2).
const playfair = Playfair_Display({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-playfair", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--font-cormorant", display: "swap" });

// Brand display + accent: Hosgura Prestica (self-hosted; one family, real italic).
const hosgura = localFont({
  src: [
    { path: "../../../public/fonts/HosguraPrestica-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../../public/fonts/HosguraPrestica-Italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-hosgura",
  display: "swap",
});
// Brand text: Instrument Sans (variable weights).
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${playfair.variable} ${inter.variable} ${cormorant.variable} ${hosgura.variable} ${instrument.variable}`}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
