"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { advancePhase } from "@/app/[locale]/(app)/(studio)/vendors/actions";

// Shown in the Planning room only when every 2→3 predicate is green. Calls the
// phase function; a predicate error (should not happen if the button showed)
// surfaces as human text.
export function AdvanceButton({ weddingId, label }: { weddingId: string; label: string }) {
  const t = useTranslations("engagement");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button disabled={pending} onClick={() => { setErr(null); start(async () => { const r = await advancePhase(weddingId); if (r?.error) setErr(t("error")); }); }}>
        {label}
      </Button>
      {err ? <p className="text-[13px] text-wine">{err}</p> : null}
    </div>
  );
}
