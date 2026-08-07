import { DomainStar } from "@/components/ui";

// The charcoal quote head, one source of markup for the couple-facing /quote/[token]
// page and the studio builder's preview of it. Pure and string-fed (no translations
// inside) so it renders identically in a server and a client tree. When the studio
// has a logo, it replaces ONLY the Playfair name line; the star, kicker and meta all
// stay exactly as today. No logo → pixel-identical to the pre-logo head.
export function QuoteHead({
  kicker, studioName, logoUrl, metaLine,
}: {
  kicker: string;
  studioName: string;
  logoUrl?: string | null;
  metaLine?: string | null;
}) {
  return (
    <div className="bg-[#111111] px-6 py-9 text-center">
      <div className="flex justify-center"><DomainStar fill="#D7C3A5" size={18} /></div>
      <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.24em] text-[#D7C3A5]">{kicker}</p>
      {logoUrl ? (
        <div className="mt-1.5 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={studioName} className="h-auto w-auto object-contain" style={{ maxHeight: "56px", maxWidth: "240px" }} />
        </div>
      ) : (
        <p className="mt-1.5 font-display text-[30px] text-[#F5F2EB]">{studioName}</p>
      )}
      {metaLine ? <p className="mt-2.5 text-[10px] uppercase tracking-[0.2em] text-[#D7C3A5]">{metaLine}</p> : null}
    </div>
  );
}
