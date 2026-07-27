import type { ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";
import { StudioNav } from "./studio-nav";

export default async function StudioLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div>
      <StudioNav />
      <div className="mx-auto max-w-[1240px] px-8 pb-20 pt-8 md:px-10">{children}</div>
    </div>
  );
}
