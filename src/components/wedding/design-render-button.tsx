"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button, DomainStar } from "@/components/ui";
import { renderCapState, RENDERS_LEFT_HINT } from "@/lib/render/limits.mjs";
import { setScene, type RenderResult } from "@/app/[locale]/(app)/wedding/[id]/design-render-actions";

// "Set the scene" — the guide head's single wine act (the head carries no other primary). Only
// mounted for staff when the guide has an image AND the OpenAI key is present (the page gates
// that), so there is never a dead control. Pending shows the breathing star (opacity+scale,
// never a rotation); the caps disable the button with a quiet register line.
export function SetSceneButton({ boardId, weddingId, rendersLeft, dayRemaining }: {
  boardId: string; weddingId: string; rendersLeft: number; dayRemaining: number;
}) {
  const t = useTranslations("design");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const cap = renderCapState(rendersLeft, dayRemaining);
  const capMsg = cap.reason === "cap_wedding" ? t("renderCapWedding") : cap.reason === "cap_day" ? t("renderCapDay") : null;

  function run() {
    setErr(null);
    start(async () => {
      const r: RenderResult = await setScene(boardId, weddingId);
      if (r.ok) { router.refresh(); return; }
      setErr(
        r.error === "cap_wedding" ? t("renderCapWedding")
          : r.error === "cap_day" ? t("renderCapDay")
            : t("renderErr"),
      );
    });
  }

  if (pending) {
    return (
      <span className="inline-flex items-center gap-2 text-[11.5px] text-text-meta">
        <span className="concierge-breathe inline-flex"><DomainStar fill="#8A7557" size={13} /></span>
        {t("settingScene")}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {!capMsg && rendersLeft <= RENDERS_LEFT_HINT ? <span className="text-[11px] text-text-meta">{t("rendersLeft", { count: rendersLeft })}</span> : null}
      <Button variant="primary" onClick={run} disabled={cap.disabled}>{t("setScene")}</Button>
      {capMsg ? <span className="text-[11px] text-text-meta">{capMsg}</span> : null}
      {err ? <span className="text-[11px] text-[color:var(--color-text-danger)]">{err}</span> : null}
    </span>
  );
}
