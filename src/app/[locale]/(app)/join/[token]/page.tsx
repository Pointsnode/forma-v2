import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, Heading, SignedMark, SignedFooter } from "@/components/ui";
import { AcceptInvite } from "./accept-invite";

// The couple's portal join hand-off, a couple surface: it carries the signed footer law.
export default async function JoinPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("invites");
  const held = (await getTranslations("couple"))("held");

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-sm flex-1 px-6 py-12">
        <div className="mb-8 flex justify-center"><SignedMark /></div>
        <Card>
          <Heading>{t("acceptTitle")}</Heading>
          <p className="mb-5 mt-1 font-accent text-[16px] text-muted">{t("membersHint")}</p>
          <AcceptInvite token={token} />
        </Card>
      </div>
      <SignedFooter heldLabel={held} />
    </div>
  );
}
