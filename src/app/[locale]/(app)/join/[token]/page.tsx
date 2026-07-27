import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, Heading } from "@/components/ui";
import { AcceptInvite } from "./accept-invite";

export default async function JoinPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("invites");

  return (
    <div className="mx-auto max-w-sm px-6 py-12">
      <Card>
        <Heading>{t("acceptTitle")}</Heading>
        <p className="mb-5 mt-1 font-accent text-[16px] text-muted">{t("membersHint")}</p>
        <AcceptInvite token={token} />
      </Card>
    </div>
  );
}
