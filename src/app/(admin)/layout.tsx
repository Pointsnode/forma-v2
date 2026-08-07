import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "../globals.css";

// The admin is its OWN root layout (the app has no src/app/layout.tsx — html/body lives
// per route root). Non-localized, EN-only, always bone. Inter for every table and label,
// Playfair only for page titles.
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// /admin is invisible: noindex/nofollow. Obscurity is not the security layer (RLS + the
// 404 door are), but there is no reason to advertise it.
export const metadata: Metadata = { title: "Forma Admin", robots: { index: false, follow: false } };

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="bone" className={`${playfair.variable} ${inter.variable}`}>
      <body className="bg-bone text-ink">{children}</body>
    </html>
  );
}
