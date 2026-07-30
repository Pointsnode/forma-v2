"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui";
import { signIn, signUp, requestReset, setPassword, type AuthState } from "./actions";

const input =
  "w-full rounded-xl bg-bone px-3.5 py-2.5 text-[14px] text-ink shadow-card outline-none placeholder:text-muted focus:shadow-lift";

function Field({ name, type, label, autoComplete }: { name: string; type: string; label: string; autoComplete?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      <input name={name} type={type} autoComplete={autoComplete} required={type !== "text"} className={input} />
    </label>
  );
}

export function SignInForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field name="email" type="email" label={t("email")} autoComplete="email" />
      <Field name="password" type="password" label={t("password")} autoComplete="current-password" />
      {state?.error ? <p className="text-[13px] text-wine">{t(`errors.${state.error}`)}</p> : null}
      <Button type="submit" disabled={pending} className="mt-1 w-full">{t("signIn")}</Button>
      <div className="flex items-center justify-between text-[13px] text-muted">
        <Link href="/sign-up" className="hover:text-ink">{t("toSignUp")}</Link>
        <Link href="/reset" className="hover:text-ink">{t("forgot")}</Link>
      </div>
    </form>
  );
}

export function SignUpForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, null);
  if (state?.sent) return <p className="text-[14px] text-sage-ink">{t("confirmSent")}</p>;
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field name="displayName" type="text" label={t("displayName")} autoComplete="name" />
      <Field name="email" type="email" label={t("email")} autoComplete="email" />
      <Field name="password" type="password" label={t("password")} autoComplete="new-password" />
      {state?.error ? <p className="text-[13px] text-wine">{t(`errors.${state.error}`)}</p> : null}
      <Button type="submit" disabled={pending} className="mt-1 w-full">{t("signUp")}</Button>
      <Link href="/sign-in" className="text-[13px] text-muted hover:text-ink">{t("toSignIn")}</Link>
    </form>
  );
}

export function ResetForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<AuthState, FormData>(requestReset, null);
  if (state?.sent) return <p className="text-[14px] text-sage-ink">{t("resetSent")}</p>;
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field name="email" type="email" label={t("email")} autoComplete="email" />
      {state?.error ? <p className="text-[13px] text-wine">{t(`errors.${state.error}`)}</p> : null}
      <Button type="submit" disabled={pending} className="mt-1 w-full">{t("sendReset")}</Button>
      <Link href="/sign-in" className="text-[13px] text-muted hover:text-ink">{t("toSignIn")}</Link>
    </form>
  );
}

// Shown by /reset/confirm. The recovery token rides through as a hidden field;
// setPassword exchanges it for a session (where the cookie survives) THEN sets the
// password, so a weak/mismatched password is caught before the token is spent and
// the same link can be retried. On expiry, the way forward sits under the error.
export function NewPasswordForm({ tokenHash, code }: { tokenHash: string | null; code: string | null }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<AuthState, FormData>(setPassword, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      {tokenHash ? <input type="hidden" name="token_hash" value={tokenHash} /> : null}
      {code ? <input type="hidden" name="code" value={code} /> : null}
      <Field name="password" type="password" label={t("newPassword")} autoComplete="new-password" />
      <Field name="confirm" type="password" label={t("confirmPassword")} autoComplete="new-password" />
      {state?.error ? <p className="text-[13px] text-wine">{t(`errors.${state.error}`)}</p> : null}
      {state?.error === "expired" ? (
        <Link href="/reset" className="text-[13px] font-medium text-ink hover:text-taupe">{t("resetAgain")} →</Link>
      ) : null}
      <Button type="submit" disabled={pending} className="mt-1 w-full">{t("setPassword")}</Button>
    </form>
  );
}
