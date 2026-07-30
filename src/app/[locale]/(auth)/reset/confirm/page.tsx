import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui";
import { NewPasswordForm } from "../../auth-forms";

// The page that never existed: the recovery link lands here. It makes NO auth calls
// at render — establishing the session during a Server Component render would throw
// the Set-Cookie away (server.ts swallows the throw), so the exchange happens in the
// setPassword server action instead, where a cookie survives. The token rides through
// as a hidden field and doubles as the form's authorization: no token → dead-link
// state (one sentence, one route out, never a 404), no form to submit.
export default async function ResetConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token_hash?: string; type?: string; code?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const sp = await searchParams;
  const tokenHash = typeof sp.token_hash === "string" && sp.type === "recovery" ? sp.token_hash : null;
  const code = typeof sp.code === "string" ? sp.code : null;

  if (!tokenHash && !code) {
    return (
      <Card>
        <h1 className="mb-2 font-display text-[22px] text-ink">{t("resetConfirmTitle")}</h1>
        <p className="mb-5 text-[14px] text-muted">{t("resetExpired")}</p>
        <Link href="/reset" className="text-[13px] font-medium text-ink hover:text-taupe">{t("resetAgain")} →</Link>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-5 font-display text-[22px] text-ink">{t("resetConfirmTitle")}</h1>
      <NewPasswordForm tokenHash={tokenHash} code={code} />
    </Card>
  );
}
