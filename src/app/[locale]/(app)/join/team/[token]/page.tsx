import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, Heading, Chip, Button, SignedMark } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { CLEARANCE_BOXES } from "@/lib/clearance";
import { AcceptTeamInvite } from "./accept-team-invite";

type Preview = {
  workspace_name: string | null;
  inviter: string | null;
  invited_email: string;
  grants: string[];
  title: string | null;
  status: "ok" | "accepted" | "expired" | "email_mismatch";
};

// The team-invite hand-off. PUBLIC (middleware) so a signed-out invitee lands here rather
// than a token-dropping bounce — but they see ZERO invite detail: only a neutral prompt to
// sign in, carrying ?next back to this page (the preview fn is authenticated-only, matrix
// stays 10). Once signed in, workspace_invite_preview renders the accept card.
export default async function JoinTeamPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("team");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-sm px-6 py-12">
        <div className="mb-8 flex justify-center"><SignedMark /></div>
        <Card>
          <Heading>{t("joinTitle")}</Heading>
          <p className="mb-5 mt-1 font-accent text-[16px] text-text-meta">{t("joinSignInHint")}</p>
          <div className="flex flex-col gap-2">
            <Link href={{ pathname: "/sign-in", query: { next: `/join/team/${token}` } }}>
              <Button className="w-full">{t("joinSignIn")}</Button>
            </Link>
            <Link href={{ pathname: "/sign-up", query: { next: `/join/team/${token}` } }} className="text-center text-[13px] text-text-meta hover:text-text-primary">
              {t("joinSignUp")}
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const { data } = await supabase.rpc("workspace_invite_preview", { p_token: token });
  const preview = ((data ?? []) as Preview[])[0] ?? null;

  const notice =
    !preview ? t("joinUnknown")
    : preview.status === "accepted" ? t("joinUsed")
    : preview.status === "expired" ? t("joinExpired")
    : preview.status === "email_mismatch" ? t("joinEmailMismatch", { email: preview.invited_email })
    : null;

  return (
    <div className="mx-auto max-w-sm px-6 py-12">
      <div className="mb-8 flex justify-center"><SignedMark /></div>
      <Card>
        <Heading>{t("joinTitle")}</Heading>
        {preview && preview.status === "ok" ? (
          <>
            <p className="mb-4 mt-1 font-accent text-[16px] text-text-meta">
              {t.rich("joinInvited", {
                workspace: preview.workspace_name ?? "·",
                inviter: preview.inviter ?? "·",
                b: (c) => <span className="font-medium text-text-primary">{c}</span>,
              })}
            </p>
            <div className="mb-5 flex flex-wrap gap-1.5">
              {CLEARANCE_BOXES.filter((k) => preview.grants.includes(k)).map((k) => (
                <Chip key={k} active>{t(`box.${k}`)}</Chip>
              ))}
              {preview.grants.length === 0 ? <span className="text-[13px] text-text-meta">{t("noBoxes")}</span> : null}
            </div>
            <AcceptTeamInvite token={token} />
          </>
        ) : (
          <p className="mt-1 font-accent text-[16px] text-text-meta">{notice}</p>
        )}
      </Card>
    </div>
  );
}
