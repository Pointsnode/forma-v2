"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, cx } from "@/components/ui";
import { submitMenuChoices } from "@/app/[locale]/menu/[code]/actions";

type Option = { id: string; label: string; diet_tags: string[] };
type Ev = { event_id: string; label: string; locked: boolean; choice_id: string | null; options: Option[] };

export function MenuForm({ code, events }: { code: string; events: Ev[] }) {
  const t = useTranslations("menu");
  const [picks, setPicks] = useState<Record<string, string | null>>(Object.fromEntries(events.map((e) => [e.event_id, e.choice_id])));
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const openEvents = events.filter((e) => !e.locked);
  if (events.length === 0) return <Banner title={t("noneTitle")} body={t("noneBody")} />;
  if (done) return <Banner tone="sage" title={t("savedTitle")} body={t("savedBody")} />;

  function submit() {
    setErr(null);
    start(async () => {
      const r = await submitMenuChoices(code, openEvents.map((e) => ({ event_id: e.event_id, option_id: picks[e.event_id] ?? null })));
      if (r.error) setErr(r.error === "FO011" ? t("errLocked") : t("errGeneric"));
      else setDone(true);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {events.map((e) => (
        <div key={e.event_id} className="rounded-[var(--radius)] bg-bone p-5">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="font-display text-[18px] text-ink">{e.label}</p>
            {e.locked ? <span className="text-[12px] text-taupe">{t("locked")}</span> : null}
          </div>
          <div className="flex flex-col gap-2">
            {e.options.map((o) => {
              const on = picks[e.event_id] === o.id;
              return (
                <button key={o.id} type="button" disabled={e.locked} onClick={() => setPicks((p) => ({ ...p, [e.event_id]: on ? null : o.id }))}
                  className={cx("flex items-center justify-between rounded-[var(--radius)] px-4 py-3 text-left text-[15px]", on ? "bg-teal text-bone" : "bg-bone text-ink", e.locked && "opacity-60")}>
                  <span>{o.label}</span>
                  {o.diet_tags.length ? <span className={cx("text-[12px]", on ? "text-champagne" : "text-taupe")}>{o.diet_tags.join(" · ")}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {err ? <p className="text-[13px] text-wine">{err}</p> : null}
      {openEvents.length ? <Button variant="primary" disabled={pending} onClick={submit}>{t("save")}</Button> : null}
    </div>
  );
}

function Banner({ tone, title, body }: { tone?: "sage"; title: string; body: string }) {
  return (
    <div className={cx("rounded-[var(--radius)] p-8 text-center", tone === "sage" ? "bg-bone text-teal" : "bg-bone")}>
      <p className="font-display text-[22px] text-ink">{title}</p>
      <p className="mt-1.5 font-accent text-[15px] text-muted">{body}</p>
    </div>
  );
}
