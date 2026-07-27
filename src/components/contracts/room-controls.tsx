"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { sendContractAction, voidContractAction } from "@/app/[locale]/(app)/wedding/[id]/contract-actions";

export function SendButton({ contractId, held }: { contractId: string; held: boolean }) {
  const t = useTranslations("contract");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <Button
        disabled={pending || held}
        onClick={() => start(async () => { const r = await sendContractAction(contractId); if (r.error) setErr(r.error === "draftHold" ? t("draftHoldError") : t("error")); })}
      >
        {t("send")}
      </Button>
      {err ? <span className="text-[12.5px] text-wine">{err}</span> : null}
    </span>
  );
}

export function VoidButton({ contractId }: { contractId: string }) {
  const t = useTranslations("contract");
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await voidContractAction(contractId); })}>
      {t("void")}
    </Button>
  );
}
