import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { NewPasswordForm } from "../../auth-forms";

// The page that never existed: the recovery link lands here. It establishes the
// session from whatever shape the link carried — a PKCE code, a token_hash to verify,
// or (when Supabase's /verify already redirected here) an existing session — then
// shows the new-password form. An expired/reused/malformed link is NOT a 404: it's
// one honest sentence and a way to ask for a fresh one. Public via middleware's
// /reset/ prefix match.
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
  const supabase = await createClient();

  let ready = false;
  if (typeof sp.token_hash === "string" && sp.type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: sp.token_hash });
    ready = !error;
  } else if (typeof sp.code === "string") {
    const { error } = await supabase.auth.exchangeCodeForSession(sp.code);
    ready = !error;
  } else {
    // Supabase's /verify already consumed the token and redirected here with a session.
    const { data } = await supabase.auth.getUser();
    ready = Boolean(data.user);
  }

  return (
    <Card>
      {ready ? (
        <>
          <h1 className="mb-5 font-display text-[22px] text-ink">{t("resetConfirmTitle")}</h1>
          <NewPasswordForm />
        </>
      ) : (
        <>
          <h1 className="mb-2 font-display text-[22px] text-ink">{t("resetConfirmTitle")}</h1>
          <p className="mb-5 text-[14px] text-muted">{t("resetExpired")}</p>
          <Link href="/reset" className="text-[13px] font-medium text-ink hover:text-taupe">{t("resetAgain")} →</Link>
        </>
      )}
    </Card>
  );
}
