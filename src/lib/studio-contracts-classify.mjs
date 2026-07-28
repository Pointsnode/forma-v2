// Pure classification for the studio "Active, across clients" card: a healthy
// summary (signed & current) + exceptions-only rows, exceptions-first. Shared by
// the studio page (server) and the logic test — no I/O here.
//
// A row is:
//   { id, weddingId, weddingName, coupleInitials, title, kind, status,
//     blockingTitle, signers: [{ sign_order, name, signed_at, declined_at, decline_reason }] }
//
// completed  → counts toward "signed & current" (never an exception).
// voided     → archived; neither counted nor shown.
// draft+held → exception "held" (blocked by an unapproved proposal).
// draft      → exception "ready" (nothing blocking; goes out when sent).
// sent / partially_signed → exception "awaiting" (whose signature is next).
// declined   → exception "declined" (with the decline reason, if given).

const HIDDEN = new Set(["voided"]);
const ORDER = { held: 0, awaiting: 1, declined: 2, ready: 3 };

export function classifyContracts(rows) {
  const completed = rows.filter((r) => r.status === "completed");
  const summary = {
    signedCurrent: completed.length,
    weddings: new Set(completed.map((r) => r.weddingId)).size,
  };

  const exceptions = [];
  for (const r of rows) {
    if (r.status === "completed" || HIDDEN.has(r.status)) continue;
    if (r.status === "draft") {
      exceptions.push(r.blockingTitle ? mk(r, "held", "wine", r.blockingTitle) : mk(r, "ready", "sand", null));
    } else if (r.status === "declined") {
      const d = (r.signers ?? []).find((s) => s.declined_at);
      exceptions.push(mk(r, "declined", "wine", d?.decline_reason ?? null));
    } else if (r.status === "sent" || r.status === "partially_signed") {
      exceptions.push(mk(r, "awaiting", "wine", nextSigner(r.signers)?.name ?? null));
    }
  }
  exceptions.sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  return { summary, exceptions };
}

// The next signer a sent contract is waiting on: lowest sign_order not yet
// signed or declined.
export function nextSigner(signers) {
  return [...(signers ?? [])]
    .filter((s) => !s.signed_at && !s.declined_at)
    .sort((a, b) => a.sign_order - b.sign_order)[0] ?? null;
}

// A template may only be deleted when no contract was created from it.
export function templateDeletable(usageCount) {
  return (usageCount ?? 0) === 0;
}

function mk(r, state, tone, detailVal) {
  return {
    id: r.id, weddingId: r.weddingId, weddingName: r.weddingName, coupleInitials: r.coupleInitials,
    title: r.title, kind: r.kind, status: r.status, state, tone, detailVal,
  };
}
