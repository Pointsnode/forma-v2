import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { SignForm, type ContractView } from "@/components/contracts/sign-form";

// Public tokenized signing surface (no account) — the RSVP pattern, ported. The
// token is the only credential; load_contract_as runs as a DEFINER fn.
export default async function SignPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("sign");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("load_contract_as", { p_token: token });

  return (
    <div className="min-h-screen bg-bone px-5 py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <div className="font-display text-[26px] tracking-[0.04em] text-ink">forma</div>
          <p className="text-[7.5px] uppercase tracking-[0.42em] text-taupe">{t("wordmark")}</p>
        </div>
        {error || !data ? (
          <div className="rounded-2xl bg-paper p-8 text-center shadow-card">
            <p className="font-display text-[22px] text-ink">{t("badTokenTitle")}</p>
            <p className="mt-1.5 font-accent text-[15px] text-muted">{t("badTokenBody")}</p>
          </div>
        ) : (
          <SignForm token={token} view={data as ContractView} />
        )}
      </div>
    </div>
  );
}
