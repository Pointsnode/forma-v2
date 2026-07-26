import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, Heading, Pill, Monogram } from "@/components/ui";
import { CreateWorkspaceForm } from "./workspace-forms";

export default async function AppHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("workspace");

  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("role, workspaces(id, name, kind)")
    .order("created_at", { ascending: true });
  const rows = (memberships ?? []) as unknown as { role: string; workspaces: { id: string; name: string; kind: string } | null }[];

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <Heading>{t("createTitle")}</Heading>
          <p className="mb-5 mt-1 font-accent text-[16px] text-muted">{t("createHint")}</p>
          <CreateWorkspaceForm />
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((m) =>
        m.workspaces ? (
          <Card key={m.workspaces.id} lift>
            <div className="flex items-center gap-3">
              <Monogram initials={m.workspaces.name.slice(0, 2).toUpperCase()} />
              <div className="min-w-0">
                <p className="truncate font-display text-[18px] text-ink">{m.workspaces.name}</p>
                <Pill tone="sand">{t(m.workspaces.kind === "studio" ? "kindStudio" : "kindCouple")}</Pill>
              </div>
            </div>
          </Card>
        ) : null
      )}
    </div>
  );
}
