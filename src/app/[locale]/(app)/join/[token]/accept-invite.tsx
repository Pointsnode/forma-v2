"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui";
import { acceptInvite } from "@/app/[locale]/(app)/wedding/[id]/loop-actions";

export function AcceptInvite({ token }: { token: string }) {
  const t = useTranslations("invites");
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function accept() {
    setErr(null);
    start(async () => {
      const r = await acceptInvite(token);
      if (r.ok && r.weddingId) router.push(`/wedding/${r.weddingId}`);
      else if (r.error === "used") setErr(t("errorUsed"));
      else if (r.error === "expired") setErr(t("errorExpired"));
      else if (r.error === "invalid") setErr(t("errorInvalid"));
      else setErr(t("errorGeneric"));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={accept} disabled={pending} className="w-full">
        {pending ? t("accepting") : t("accept")}
      </Button>
      {err ? <p className="text-[13.5px] text-[color:var(--color-text-danger)]">{err}</p> : null}
    </div>
  );
}
