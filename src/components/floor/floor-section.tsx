"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Card, Heading, cx } from "@/components/ui";
import { seatLabel } from "@/lib/seat-geometry.mjs";
import { ensurePlan, toggleCoupleEdit } from "@/app/[locale]/(app)/wedding/[id]/floor-actions";
import type { FloorEditorProps } from "./floor-editor";

// konva is client-only — never SSR it.
const FloorEditor = dynamic(() => import("./floor-editor").then((m) => m.FloorEditor), {
  ssr: false, loading: () => <div className="py-16 text-center font-accent text-[15px] text-muted">…</div>,
});

type Data = Omit<FloorEditorProps, "planId"> & { planId: string | null; eventLabel: string };

export function FloorSection(props: Data) {
  const t = useTranslations("floor");
  const router = useRouter();
  const [view, setView] = useState<"canvas" | "list">("canvas");
  const [pending, start] = useTransition();

  // no plan yet — staff creates it, couple/others see the honest empty state
  if (!props.planId) {
    return (
      <Card>
        <Heading className="mb-1 text-[18px]">{t("seating")}</Heading>
        <p className="mb-3 font-accent text-[15px] text-muted">{t("noPlan")}</p>
        {props.role === "staff" ? (
          <button disabled={pending} onClick={() => start(async () => { await ensurePlan(props.eventId, props.weddingId, t("planName", { event: props.eventLabel })); router.refresh(); })}
            className="rounded-[var(--radius)] bg-ink px-4 py-2 text-[13px] text-bone">{t("createPlan")}</button>
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Heading className="text-[18px]">{t("seating")}</Heading>
        <div className="ml-2 flex overflow-hidden rounded-[var(--radius)] bg-bone text-[12px]">
          <button onClick={() => setView("canvas")} className={cx("px-3 py-1", view === "canvas" ? "bg-ink text-bone" : "text-muted")}>{t("viewCanvas")}</button>
          <button onClick={() => setView("list")} className={cx("px-3 py-1", view === "list" ? "bg-ink text-bone" : "text-muted")}>{t("viewList")}</button>
        </div>
        {props.role === "staff" ? (
          <label className="ml-auto flex items-center gap-2 text-[12px] text-muted">
            <input type="checkbox" defaultChecked={props.coupleCanEdit} onChange={(e) => start(async () => { await toggleCoupleEdit(props.planId!, e.target.checked); router.refresh(); })} />
            {t("coupleEditToggle")}
          </label>
        ) : null}
      </div>

      {view === "canvas" ? (
        <FloorEditor {...props} planId={props.planId} />
      ) : (
        <div>
          <p className="mb-2 text-[12.5px] text-muted">{t("totals", { seated: props.seatedCount, attending: props.attendingCount })}</p>
          <div className="flex flex-col gap-3">
            {props.tables.map((tb) => (
              <div key={tb.id} className="rounded-[var(--radius)] bg-bone p-3">
                <p className="mb-1 flex items-center justify-between font-display text-[15px] text-ink">{tb.name}<span className="text-[12px] text-muted">{tb.seats.length}/{tb.capacity}</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {tb.seats.length === 0 ? <span className="text-[12px] text-muted">{t("emptyTable")}</span> : tb.seats.map((s) => (
                    <span key={s.seatNo} className="rounded-[var(--radius)] bg-bone px-2 py-0.5 text-[11.5px] text-ink"><b className="text-taupe">{seatLabel(s.seatNo)}</b> · {s.name}{s.diet.length ? ` · ${s.diet.join(", ")}` : ""}</span>
                  ))}
                </div>
              </div>
            ))}
            {props.tables.length === 0 ? <p className="py-4 text-center font-accent text-[15px] text-muted">{t("noTables")}</p> : null}
            {props.attendees.filter((a) => !a.seated).length ? (
              <div className="rounded-[var(--radius)] border border-hairline p-3">
                <p className="mb-1 text-[12px] uppercase tracking-[0.1em] text-muted">{t("stillUnseated")}</p>
                <div className="flex flex-wrap gap-1.5">{props.attendees.filter((a) => !a.seated).map((a) => <span key={a.guestId} className="rounded-[var(--radius)] bg-bone px-2 py-0.5 text-[11.5px] text-taupe">{a.name}</span>)}</div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}
