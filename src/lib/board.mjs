// Pure Board logic — shared by the rail and the tests. No IO. The six reactions live here as the
// single source (the SQL check mirrors them).
export const BOARD_EMOJI = ["👍", "❤️", "🎉", "👀", "✅", "🙏"];

// Parse @mentions from a body. Returns lowercased handle tokens (letters/digits/._-) and whether
// @concierge was mentioned. @concierge is a reserved handle that routes to the concierge, not a user.
export function parseMentions(text) {
  const tokens = [];
  let concierge = false;
  for (const m of String(text ?? "").matchAll(/(^|\s)@([a-z0-9._-]+)/gi)) {
    const handle = m[2].toLowerCase();
    if (handle === "concierge") concierge = true;
    else if (!tokens.includes(handle)) tokens.push(handle);
  }
  return { tokens, concierge };
}

// Unread = messages created strictly after the thread's last_read_at (a null marker means all are
// unread). Never counts your own messages — you've "read" what you wrote.
export function unreadCount(messages, lastReadIso, selfId) {
  const cutoff = lastReadIso ? new Date(lastReadIso).getTime() : 0;
  return (messages ?? []).filter((m) => {
    if (selfId && m.author_id === selfId) return false;
    return new Date(m.created_at).getTime() > cutoff;
  }).length;
}

// Task-chip display for a live task_status. Kept here so the chip and any export agree.
export function chipStatus(taskStatus) {
  switch (taskStatus) {
    case "completed": return { key: "completed", done: true };
    case "working": return { key: "working", done: false };
    case "waiting": return { key: "waiting", done: false };
    default: return { key: "pending", done: false };
  }
}
