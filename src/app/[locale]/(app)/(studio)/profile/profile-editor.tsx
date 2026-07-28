"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, Heading, Button, Badge, cx } from "@/components/ui";
import type { ProfileContent, Area, Service } from "@/lib/directory";
import { saveProfile, saveSlug, publishProfile, unpublishProfile, uploadPhoto } from "./actions";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const imgUrl = (p?: string | null) => (!p ? null : /^https?:\/\//.test(p) ? p : `${SB}/storage/v1/object/public/planner-profiles/${encodeURI(p)}`);

const SLUG_ERR: Record<string, string> = { FD010: "slugFormat", FD011: "slugTaken" };

const INPUT = "w-full rounded-xl bg-bone px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-sand";

export function ProfileEditor({
  initialSlug,
  initialProfile,
  initialAreas,
  initialPublished,
  publicBase,
}: {
  initialSlug: string;
  initialProfile: ProfileContent;
  initialAreas: Area[];
  initialPublished: boolean;
  publicBase: string;
}) {
  const t = useTranslations("profile");
  const [slug, setSlug] = useState(initialSlug);
  const [tagline, setTagline] = useState({ en: initialProfile.tagline?.en ?? "", es: initialProfile.tagline?.es ?? "" });
  const [about, setAbout] = useState({ en: initialProfile.about?.en ?? "", es: initialProfile.about?.es ?? "" });
  const [hero, setHero] = useState<string>(initialProfile.hero ?? "");
  const [gallery, setGallery] = useState<string[]>(initialProfile.gallery ?? []);
  const [services, setServices] = useState<Service[]>(initialProfile.services ?? []);
  const [areas, setAreas] = useState<Area[]>(initialAreas);
  const [booking, setBooking] = useState(initialProfile.booking_url ?? "");
  const [discovery, setDiscovery] = useState(!!initialProfile.discovery_calls_enabled);
  const [instagram, setInstagram] = useState(initialProfile.instagram ?? "");
  const [website, setWebsite] = useState(initialProfile.website ?? "");
  const [published, setPublished] = useState(initialPublished);

  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState<"hero" | "gallery" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const heroInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  function buildProfile(): ProfileContent {
    return {
      tagline: { en: tagline.en.trim(), es: tagline.es.trim() },
      about: { en: about.en.trim(), es: about.es.trim() },
      hero: hero || undefined,
      gallery,
      services: services.filter((s) => s.name.trim()),
      booking_url: booking.trim() || undefined,
      discovery_calls_enabled: discovery,
      instagram: instagram.trim() || undefined,
      website: website.trim() || undefined,
    };
  }

  const checks: { key: string; ok: boolean }[] = [
    { key: "tagline", ok: !!(tagline.en.trim() || tagline.es.trim()) },
    { key: "about", ok: !!(about.en.trim() || about.es.trim()) },
    { key: "areas", ok: areas.filter((a) => a.country.trim() && a.region.trim()).length > 0 },
    { key: "hero", ok: !!hero },
    { key: "gallery", ok: gallery.length >= 3 },
    { key: "services", ok: services.filter((s) => s.name.trim()).length >= 1 },
  ];
  const allOk = checks.every((c) => c.ok);

  async function persist(): Promise<boolean> {
    const cleanAreas = areas.filter((a) => a.country.trim() && a.region.trim());
    const s = await saveSlug(slug.trim());
    if (s.error) {
      setMsg({ tone: "err", text: t(SLUG_ERR[s.error] ?? "saveError") });
      return false;
    }
    const r = await saveProfile(buildProfile(), cleanAreas);
    if (r.error) {
      setMsg({ tone: "err", text: t("saveError") });
      return false;
    }
    return true;
  }

  function onSave() {
    setMsg(null);
    start(async () => {
      if (await persist()) setMsg({ tone: "ok", text: t("saved") });
    });
  }

  function onPublish() {
    setMsg(null);
    start(async () => {
      if (!(await persist())) return;
      const r = await publishProfile();
      if (r.error) setMsg({ tone: "err", text: t("publishBlocked") });
      else {
        setPublished(true);
        setMsg({ tone: "ok", text: t("published") });
      }
    });
  }

  function onUnpublish() {
    setMsg(null);
    start(async () => {
      const r = await unpublishProfile();
      if (r.error) setMsg({ tone: "err", text: t("saveError") });
      else {
        setPublished(false);
        setMsg({ tone: "ok", text: t("unpublished") });
      }
    });
  }

  function pickFile(kind: "hero" | "gallery") {
    (kind === "hero" ? heroInput : galleryInput).current?.click();
  }

  async function onFile(kind: "hero" | "gallery", e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(kind);
    setMsg(null);
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      const r = await uploadPhoto(fd);
      if (r.ok && r.path) {
        if (kind === "hero") setHero(r.path);
        else setGallery((g) => [...g, r.path!]);
      } else {
        setMsg({ tone: "err", text: t("uploadError") });
      }
    }
    setUploading(null);
  }

  return (
    <div className="space-y-5">
      {/* Publish bar */}
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Heading className="text-[20px]">{t("title")}</Heading>
            <Badge tone={published ? "sage" : "sand"}>{published ? t("live") : t("draft")}</Badge>
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            {published ? (
              <a href={`${publicBase}/p/${slug}`} target="_blank" rel="noreferrer" className="text-taupe underline-offset-2 hover:underline">
                {publicBase.replace(/^https?:\/\//, "")}/p/{slug} ↗
              </a>
            ) : (
              t("draftHint")
            )}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {msg ? <span className={cx("text-[13px]", msg.tone === "ok" ? "text-sage-ink" : "text-wine")}>{msg.text}</span> : null}
          <Button variant="ghost" onClick={onSave} disabled={pending}>
            {t("save")}
          </Button>
          {published ? (
            <Button variant="ghost" onClick={onUnpublish} disabled={pending}>
              {t("unpublish")}
            </Button>
          ) : (
            <Button onClick={onPublish} disabled={pending || !allOk}>
              {t("publish")}
            </Button>
          )}
        </div>
      </Card>

      {/* Checklist */}
      {!published && (
        <Card>
          <Heading className="text-[17px]">{t("checklistTitle")}</Heading>
          <p className="mb-3 mt-0.5 text-[12.5px] text-muted">{t("checklistHint")}</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {checks.map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-[13.5px]">
                <span className={cx("inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]", c.ok ? "bg-sage text-bone" : "bg-sand-soft text-taupe")}>
                  {c.ok ? "✓" : "·"}
                </span>
                <span className={c.ok ? "text-ink" : "text-muted"}>{t(`check_${c.key}`)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Address */}
      <Card>
        <Heading className="text-[17px]">{t("addressTitle")}</Heading>
        <p className="mb-3 mt-0.5 text-[12.5px] text-muted">{t("addressHint")}</p>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted">/p/</span>
          <input className={cx(INPUT, "max-w-xs")} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="atelier-lumiere" />
        </div>
      </Card>

      {/* Words */}
      <Card className="space-y-4">
        <Heading className="text-[17px]">{t("wordsTitle")}</Heading>
        <BilingualField label={t("tagline")} value={tagline} onChange={setTagline} rows={2} />
        <BilingualField label={t("about")} value={about} onChange={setAbout} rows={5} />
      </Card>

      {/* Photos */}
      <Card>
        <Heading className="text-[17px]">{t("photosTitle")}</Heading>
        <p className="mb-3 mt-0.5 text-[12.5px] text-muted">{t("photosHint")}</p>
        <input ref={heroInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onFile("hero", e)} />
        <input ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => onFile("gallery", e)} />

        <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-taupe">{t("hero")}</p>
        <div className="mb-4 flex items-end gap-3">
          <div className="h-28 w-44 overflow-hidden rounded-xl bg-sand-soft">
            {imgUrl(hero) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgUrl(hero)!} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <Button variant="ghost" onClick={() => pickFile("hero")} disabled={uploading !== null}>
            {uploading === "hero" ? t("uploading") : hero ? t("replace") : t("addPhoto")}
          </Button>
        </div>

        <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-taupe">{t("gallery")}</p>
        <div className="flex flex-wrap gap-2.5">
          {gallery.map((g, i) => (
            <div key={g} className="group relative h-24 w-24 overflow-hidden rounded-lg bg-sand-soft">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgUrl(g)!} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setGallery((gs) => gs.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 rounded-full bg-ink/70 px-1.5 text-[11px] text-bone opacity-0 transition-opacity group-hover:opacity-100"
                aria-label={t("remove")}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => pickFile("gallery")}
            disabled={uploading !== null}
            className="flex h-24 w-24 items-center justify-center rounded-lg bg-bone text-[13px] text-taupe hover:bg-sand-soft disabled:opacity-50"
          >
            {uploading === "gallery" ? t("uploading") : "+"}
          </button>
        </div>
      </Card>

      {/* Services */}
      <Card>
        <Heading className="text-[17px]">{t("servicesTitle")}</Heading>
        <p className="mb-3 mt-0.5 text-[12.5px] text-muted">{t("servicesHint")}</p>
        <div className="space-y-2">
          {services.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={INPUT}
                placeholder={t("serviceName")}
                value={s.name}
                onChange={(e) => setServices((ss) => ss.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <input
                className={cx(INPUT, "max-w-[140px]")}
                type="number"
                placeholder={t("fromPricePlaceholder")}
                value={s.from_price ?? ""}
                onChange={(e) => setServices((ss) => ss.map((x, j) => (j === i ? { ...x, from_price: e.target.value ? Number(e.target.value) : undefined } : x)))}
              />
              <button type="button" onClick={() => setServices((ss) => ss.filter((_, j) => j !== i))} className="shrink-0 text-[16px] text-muted hover:text-wine" aria-label={t("remove")}>
                ×
              </button>
            </div>
          ))}
        </div>
        <Button variant="ghost" className="mt-3 px-0" onClick={() => setServices((ss) => [...ss, { name: "" }])}>
          + {t("addService")}
        </Button>
      </Card>

      {/* Areas */}
      <Card>
        <Heading className="text-[17px]">{t("areasTitle")}</Heading>
        <p className="mb-3 mt-0.5 text-[12.5px] text-muted">{t("areasHint")}</p>
        <div className="space-y-2">
          {areas.map((a, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
              <input className={INPUT} placeholder={t("country")} value={a.country} onChange={(e) => setAreas((as) => as.map((x, j) => (j === i ? { ...x, country: e.target.value } : x)))} />
              <input className={INPUT} placeholder={t("region")} value={a.region} onChange={(e) => setAreas((as) => as.map((x, j) => (j === i ? { ...x, region: e.target.value } : x)))} />
              <input className={INPUT} placeholder={t("city")} value={a.city ?? ""} onChange={(e) => setAreas((as) => as.map((x, j) => (j === i ? { ...x, city: e.target.value } : x)))} />
              <button type="button" onClick={() => setAreas((as) => as.filter((_, j) => j !== i))} className="shrink-0 text-[16px] text-muted hover:text-wine" aria-label={t("remove")}>
                ×
              </button>
            </div>
          ))}
        </div>
        <Button variant="ghost" className="mt-3 px-0" onClick={() => setAreas((as) => [...as, { country: "", region: "", city: "" }])}>
          + {t("addArea")}
        </Button>
      </Card>

      {/* Discovery + links */}
      <Card className="space-y-4">
        <Heading className="text-[17px]">{t("bookingTitle")}</Heading>
        <label className="flex items-center gap-2.5 text-[14px] text-ink">
          <input type="checkbox" checked={discovery} onChange={(e) => setDiscovery(e.target.checked)} className="h-4 w-4 accent-ink" />
          {t("discoveryEnable")}
        </label>
        <div>
          <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-taupe">{t("calendly")}</p>
          <input className={INPUT} placeholder="https://calendly.com/your-studio/discovery" value={booking} onChange={(e) => setBooking(e.target.value)} />
          <p className="mt-1 text-[11.5px] text-muted">{t("calendlyHint")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-taupe">{t("instagram")}</p>
            <input className={INPUT} placeholder="https://instagram.com/…" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
          </div>
          <div>
            <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-taupe">{t("website")}</p>
            <input className={INPUT} placeholder="https://…" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
        </div>
      </Card>
    </div>
  );
}

function BilingualField({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: { en: string; es: string };
  onChange: (v: { en: string; es: string }) => void;
  rows: number;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-taupe">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["en", "es"] as const).map((loc) => (
          <div key={loc}>
            <span className="mb-1 block text-[10.5px] uppercase tracking-[0.2em] text-muted">{loc}</span>
            <textarea
              rows={rows}
              className="w-full resize-y rounded-xl bg-bone px-3.5 py-2.5 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-sand"
              value={value[loc]}
              onChange={(e) => onChange({ ...value, [loc]: e.target.value })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
