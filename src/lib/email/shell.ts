import "server-only";

const STAR = `<svg width="14" height="14" viewBox="-105 -105 210 210"><path d="M0.000,-100.000 L29.289,-70.711 L70.711,-70.711 L70.711,-29.289 L100.000,0.000 L70.711,29.289 L70.711,70.711 L29.289,70.711 L0.000,100.000 L-29.289,70.711 L-70.711,70.711 L-70.711,29.289 L-100.000,0.000 L-70.711,-29.289 L-70.711,-70.711 L-29.289,-70.711 Z" fill="#D7C3A5"/></svg>`;

// Edition One transactional email shell (table-safe, inline styles): a charcoal header with
// the champagne star above the bone wordmark (SignedMark anatomy), a bone body, and a
// charcoal footer with the held line. The studio NAME isn't available to these recipients
// (same as the web footer), so the held line is name-free; EN/ES here, FR/IT fall back to
// EN until the email catalog namespace lands (the documented gap).
export function emailShell(body: string, locale: string): string {
  const held = locale === "es" ? "Con cuidado" : "Held with care";
  return `<div style="background:#F5F2EB;font-family:Georgia,'Times New Roman',serif;color:#3B3833">
    <div style="background:#111111;text-align:center;padding:30px 0 26px">
      ${STAR}<br>
      <span style="font-family:'Playfair Display',Georgia,serif;font-size:20px;color:#F5F2EB;display:inline-block;margin-top:8px"><span style="font-style:italic">f</span>orma</span>
    </div>
    <div style="max-width:520px;margin:0 auto;padding:30px 24px;font-size:15px;line-height:1.6">${body}</div>
    <div style="background:#111111;text-align:center;padding:24px 0">
      <span style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#D7C3A5">${held}</span>
    </div>
  </div>`;
}

// The single wine action per email. Radius token (4px), no pill, uppercase.
export function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:16px;background:#6E353B;color:#F5F2EB;text-decoration:none;padding:12px 24px;border-radius:4px;font-family:Inter,Arial,sans-serif;font-size:13px;letter-spacing:.08em;text-transform:uppercase">${label}</a>`;
}
