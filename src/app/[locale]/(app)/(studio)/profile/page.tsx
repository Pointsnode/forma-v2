import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace } from "@/lib/workspace";
import { SITE_URL } from "@/lib/env";
import { Card } from "@/components/ui";
import type { ProfileContent, Area } from "@/lib/directory";
import { ProfileEditor } from "./profile-editor";

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("profile");
  const supabase = await createClient();

  const workspaceId = await currentWorkspace(supabase);
  if (!workspaceId) {
    return (
      <Card>
        <p className="py-6 text-center font-accent text-[16px] text-muted">{t("noWorkspace")}</p>
      </Card>
    );
  }

  const [{ data: w }, { data: areas }] = await Promise.all([
    supabase.from("workspaces").select("slug, profile, profile_published").eq("id", workspaceId).single(),
    supabase.from("workspace_service_areas").select("country, region, city").eq("workspace_id", workspaceId).order("created_at", { ascending: true }),
  ]);

  return (
    <ProfileEditor
      initialSlug={(w?.slug as string) ?? ""}
      initialProfile={(w?.profile as ProfileContent) ?? {}}
      initialAreas={(areas as Area[]) ?? []}
      initialPublished={!!w?.profile_published}
      publicBase={SITE_URL}
    />
  );
}
