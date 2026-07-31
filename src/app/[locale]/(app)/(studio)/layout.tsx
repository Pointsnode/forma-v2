import type { ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace } from "@/lib/workspace";
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
  // The section nav is studio-only. A non-workspace user (a couple reaching /settings
  // from the account menu) never sees the studio tabs — the nav needs a workspace to
  // mean anything.
  const supabase = await createClient();
  const hasWorkspace = (await currentWorkspace(supabase)) != null;
  return (
    <div>
      {hasWorkspace ? <StudioNav /> : null}
      <div className="mx-auto max-w-[1240px] px-8 pb-20 pt-8 md:px-10">{children}</div>
    </div>
  );
}
