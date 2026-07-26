// Pure guest-intake parsing + dedup — shared by the intake UI and tested by
// test:logic. Plain .mjs so the plain-node logic runner can import it (types via
// JSDoc; consumers get inference through allowJs).

/** @typedef {{ full_name: string, email: string | null, phone: string | null }} ParsedGuest */

/** Parse pasted rows / CSV ("name, email, phone" per line). @param {string} text @returns {ParsedGuest[]} */
export function parseGuestRows(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/\s*[,;\t]\s*/);
    const full_name = (cols[0] ?? "").trim();
    if (!full_name) continue;
    out.push({ full_name, email: normEmail(cols[1]), phone: normPhone(cols[2]) });
  }
  return out;
}

const normEmail = (s) => {
  const v = (s ?? "").trim().toLowerCase();
  return v && /.+@.+\..+/.test(v) ? v : null;
};
const normPhone = (s) => {
  const v = (s ?? "").replace(/[^0-9+]/g, "");
  return v.length >= 7 ? v : null;
};
const nameKey = (n) => n.trim().toLowerCase().replace(/\s+/g, " ");

// Dedup against existing guests AND within the batch: duplicate when the email
// (case-insensitive) already exists, or — no email — when name+phone matches.
/** @param {ParsedGuest[]} parsed @param {ParsedGuest[]} existing */
export function dedupeGuests(parsed, existing) {
  const emails = new Set(existing.map((g) => g.email).filter(Boolean));
  const namePhones = new Set(existing.filter((g) => !g.email).map((g) => `${nameKey(g.full_name)}|${g.phone ?? ""}`));
  const toAdd = [];
  let duplicates = 0;
  for (const p of parsed) {
    const np = `${nameKey(p.full_name)}|${p.phone ?? ""}`;
    if ((p.email && emails.has(p.email)) || (!p.email && namePhones.has(np))) {
      duplicates++;
      continue;
    }
    if (p.email) emails.add(p.email);
    else namePhones.add(np);
    toAdd.push(p);
  }
  return { toAdd, duplicates };
}
