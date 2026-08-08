import assert from "node:assert/strict";
import { parseMentions, unreadCount, chipStatus, BOARD_EMOJI } from "./board.mjs";

// Mentions: distinct user handles + the reserved @concierge.
let r = parseMentions("hey @Ana and @luis, @concierge can you check @ana again?");
assert.deepEqual(r.tokens, ["ana", "luis"], "distinct, lowercased, concierge excluded from user tokens");
assert.equal(r.concierge, true);
assert.deepEqual(parseMentions("no mentions here").tokens, []);
assert.equal(parseMentions("email a@b.com is not a mention").tokens.length, 0, "mid-word @ is not a mention");
assert.equal(parseMentions("@concierge").concierge, true);

// Unread: strictly after last_read, excluding your own.
const msgs = [
  { author_id: "u1", created_at: "2026-08-01T10:00:00Z" }, // before read
  { author_id: "u2", created_at: "2026-08-02T10:00:00Z" }, // after read → unread
  { author_id: "me", created_at: "2026-08-03T10:00:00Z" }, // mine → not unread
  { author_id: "u2", created_at: "2026-08-03T11:00:00Z" }, // after read → unread
];
assert.equal(unreadCount(msgs, "2026-08-01T12:00:00Z", "me"), 2);
assert.equal(unreadCount(msgs, null, "me"), 3, "null marker → all but mine");
assert.equal(unreadCount([], "2026-08-01T00:00:00Z", "me"), 0);

// Chip status maps the live task_status.
assert.deepEqual(chipStatus("completed"), { key: "completed", done: true });
assert.deepEqual(chipStatus("working"), { key: "working", done: false });
assert.deepEqual(chipStatus("pending"), { key: "pending", done: false });
assert.deepEqual(chipStatus(undefined), { key: "pending", done: false });

// The six reactions are fixed.
assert.equal(BOARD_EMOJI.length, 6);
assert.ok(BOARD_EMOJI.includes("🎉"));

console.log("board: mentions + unread + chip status ok");
