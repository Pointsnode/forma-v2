"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button, cx } from "@/components/ui";
import { presentVendor } from "@/app/[locale]/(app)/(studio)/vendors/actions";
import { PresentForm, AddVendorForm } from "./vendor-forms";

type PickVendor = { id: string; name: string; kind: string; cities: string[]; live: boolean };
type EventOpt = { id: string; label: string };

const NON_VENUE_KINDS = ["catering", "florals", "music", "photo_video", "beauty", "decor", "rentals", "other"];
const kindKey = (k: string) => `kind${k.charAt(0).toUpperCase()}${k.slice(1)}`;

// The wedding-side doorway (§A): present a vendor OR a venue from inside a wedding.
// Reads the SAME workspace catalogue and writes through the SAME present_vendor —
// the wedding never owns a vendor. Live engagements are shown disabled; declined/
// archived are absent from `live` and can be re-presented. "Add one" opens the
// studio create form inline, then the new vendor appears in the catalogue.
export function WeddingPresentPicker({ weddingId, events, catalogue }: { weddingId: string; events: EventOpt[]; catalogue: PickVendor[] }) {
  const t = useTranslations("vendors");
  const router = useRouter();
  const [mode, setMode] = useState<null | "vendor" | "venue">(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [picked, setPicked] = useState<PickVendor | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const list = useMemo(() => {
    const isVenue = mode === "venue";
    return catalogue.filter((v) => {
      if (isVenue ? v.kind !== "venue" : v.kind === "venue") return false;
      if (!isVenue && kind !== "all" && v.kind !== kind) return false;
      if (search && !v.name.toLowerCase().includes(search.toLowerCase()) && !v.cities.some((c) => c.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [catalogue, mode, kind, search]);

  function open(m: "vendor" | "venue") { setMode(m); setSearch(""); setKind("all"); setPicked(null); setAdding(false); }
  function close() { setMode(null); setPicked(null); setAdding(false); }
  function done(name: string) { close(); setToast(t("loopOpenToast", { vendor: name })); setTimeout(() => setToast(null), 4200); }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => open("vendor")}>{t("presentAVendor")}</Button>
        <Button variant="ghost" onClick={() => open("venue")}>{t("presentAVenue")}</Button>
      </div>

      {mode ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button aria-hidden className="absolute inset-0 cursor-default bg-[rgba(21,18,16,0.55)]" onClick={close} />
          <div className="relative flex max-h-[86vh] w-full max-w-[560px] flex-col rounded-[var(--radius)] bg-surface-card p-7">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[23px] text-text-primary">{mode === "venue" ? t("presentAVenue") : t("presentAVendor")}</h3>
              <button onClick={close} className="text-[20px] leading-none text-text-meta hover:text-text-primary" aria-label={t("cancel")}>×</button>
            </div>

            {picked ? (
              <div className="mt-4 overflow-y-auto">
                <button onClick={() => setPicked(null)} className="mb-2 text-[12.5px] text-text-meta hover:text-text-primary">← {t("backToCatalogue")}</button>
                <p className="font-display text-[18px] text-text-primary">{picked.name}</p>
                <PresentForm vendorKind={picked.kind} weddingId={weddingId} events={events} onDone={() => done(picked.name)}
                  doPresent={(evs, est, note) => presentVendor(picked.id, weddingId, evs, est, note)} />
              </div>
            ) : adding ? (
              <div className="mt-4 overflow-y-auto">
                <button onClick={() => { setAdding(false); router.refresh(); }} className="mb-3 text-[12.5px] text-text-meta hover:text-text-primary">← {t("backToCatalogue")}</button>
                <p className="mb-3 font-accent text-[14px] italic text-taupe">{t("addHint")}</p>
                <AddVendorForm defaultKind={mode === "venue" ? "venue" : "other"} />
              </div>
            ) : (
              <>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchCatalogue")}
                  className="mt-4 w-full rounded-[var(--radius)] bg-surface-card px-3.5 py-2.5 text-[14px] text-text-primary outline-none" />
                {mode === "vendor" ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {["all", ...NON_VENUE_KINDS].map((k) => (
                      <button key={k} onClick={() => setKind(k)} className={cx("rounded-[var(--radius)] px-3 py-1 text-[12px]", kind === k ? "bg-surface-chrome text-bone" : "bg-surface-card text-text-meta hover:text-text-primary")}>
                        {k === "all" ? t("filterAll") : t(kindKey(k))}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex-1 space-y-1 overflow-y-auto">
                  {list.length === 0 ? <p className="py-6 text-center font-accent text-[15px] italic text-text-meta">{t("catalogueEmpty")}</p> : null}
                  {list.map((v) => v.live ? (
                    <div key={v.id} className="flex items-center justify-between rounded-[var(--radius)] px-3 py-2.5 opacity-60">
                      <span className="text-[14px] text-text-primary">{v.name}<span className="ml-2 text-[12px] text-text-meta">{t(kindKey(v.kind))}</span></span>
                      <span className="text-[11.5px] uppercase tracking-[0.12em] text-taupe">{t("alreadyPresented")}</span>
                    </div>
                  ) : (
                    <button key={v.id} onClick={() => setPicked(v)} className="flex w-full items-center justify-between rounded-[var(--radius)] px-3 py-2.5 text-left hover:bg-surface-card">
                      <span className="text-[14px] text-text-primary">{v.name}<span className="ml-2 text-[12px] text-text-meta">{t(kindKey(v.kind))}{v.cities.length ? ` · ${v.cities[0]}` : ""}</span></span>
                      <span className="text-[13px] text-taupe">{t("present")} →</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setAdding(true)} className="mt-3 border-t border-hairline-token pt-3 text-left text-[13px] text-taupe hover:text-text-primary">{t("notInCatalogue")}</button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {toast ? <div className="fixed bottom-16 left-1/2 z-[95] w-max max-w-[92vw] -translate-x-1/2 rounded-[var(--radius)] bg-surface-chrome px-6 py-3 text-center text-[12.5px] text-bone">{toast}</div> : null}
    </>
  );
}
