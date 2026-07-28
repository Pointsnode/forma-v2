import assert from "node:assert/strict";
import { classifyContracts, nextSigner, templateDeletable } from "./studio-contracts-classify.mjs";

const row = (o) => ({ id: o.id ?? "c", weddingId: o.weddingId ?? "w1", weddingName: "A & B", coupleInitials: "A·B", title: o.title ?? "T", kind: "vendor", status: o.status, blockingTitle: o.blockingTitle ?? null, signers: o.signers ?? [] });

// ── summary: only completed count; distinct weddings ─────────────────────────
{
  const { summary } = classifyContracts([
    row({ id: "1", weddingId: "w1", status: "completed" }),
    row({ id: "2", weddingId: "w1", status: "completed" }),
    row({ id: "3", weddingId: "w2", status: "completed" }),
    row({ id: "4", weddingId: "w3", status: "draft" }),
  ]);
  assert.equal(summary.signedCurrent, 3);
  assert.equal(summary.weddings, 2); // w1, w2 — w3's draft doesn't count
}

// ── draft held vs ready ──────────────────────────────────────────────────────
{
  const { exceptions } = classifyContracts([
    row({ id: "held", status: "draft", blockingTitle: "Blush floral revision" }),
    row({ id: "ready", status: "draft" }),
  ]);
  const held = exceptions.find((e) => e.id === "held");
  const ready = exceptions.find((e) => e.id === "ready");
  assert.equal(held.state, "held"); assert.equal(held.tone, "wine"); assert.equal(held.detailVal, "Blush floral revision");
  assert.equal(ready.state, "ready"); assert.equal(ready.tone, "sand"); assert.equal(ready.detailVal, null);
}

// ── awaiting: next signer is the lowest-order unsigned ───────────────────────
{
  const { exceptions } = classifyContracts([
    row({ id: "sent", status: "partially_signed", signers: [
      { sign_order: 1, name: "Planner", signed_at: "2026-01-01", declined_at: null, decline_reason: null },
      { sign_order: 2, name: "Couple", signed_at: null, declined_at: null, decline_reason: null },
      { sign_order: 3, name: "Vendor", signed_at: null, declined_at: null, decline_reason: null },
    ] }),
  ]);
  assert.equal(exceptions[0].state, "awaiting");
  assert.equal(exceptions[0].detailVal, "Couple"); // order 2, first unsigned
}

// ── declined carries the decliner's reason ───────────────────────────────────
{
  const { exceptions } = classifyContracts([
    row({ id: "d", status: "declined", signers: [
      { sign_order: 1, name: "Couple", signed_at: null, declined_at: "2026-02-02", decline_reason: "Budget changed" },
    ] }),
  ]);
  assert.equal(exceptions[0].state, "declined");
  assert.equal(exceptions[0].detailVal, "Budget changed");
}

// ── voided is neither counted nor shown; completed never an exception ────────
{
  const { summary, exceptions } = classifyContracts([
    row({ id: "v", status: "voided" }),
    row({ id: "done", status: "completed" }),
  ]);
  assert.equal(summary.signedCurrent, 1);
  assert.equal(exceptions.length, 0);
}

// ── exceptions-first ordering: held, awaiting, declined, ready ───────────────
{
  const { exceptions } = classifyContracts([
    row({ id: "ready", status: "draft" }),
    row({ id: "declined", status: "declined", signers: [{ sign_order: 1, name: "x", signed_at: null, declined_at: "t", decline_reason: null }] }),
    row({ id: "awaiting", status: "sent", signers: [{ sign_order: 1, name: "x", signed_at: null, declined_at: null, decline_reason: null }] }),
    row({ id: "held", status: "draft", blockingTitle: "b" }),
  ]);
  assert.deepEqual(exceptions.map((e) => e.id), ["held", "awaiting", "declined", "ready"]);
}

// ── nextSigner skips signed and declined ─────────────────────────────────────
{
  const n = nextSigner([
    { sign_order: 1, name: "a", signed_at: "t", declined_at: null },
    { sign_order: 2, name: "b", signed_at: null, declined_at: "t" },
    { sign_order: 3, name: "c", signed_at: null, declined_at: null },
  ]);
  assert.equal(n.name, "c");
  assert.equal(nextSigner([]), null);
}

// ── a used template refuses deletion ─────────────────────────────────────────
assert.equal(templateDeletable(0), true);
assert.equal(templateDeletable(1), false);
assert.equal(templateDeletable(9), false);

console.log("studio-contracts: classifier + delete-refusal ok");
