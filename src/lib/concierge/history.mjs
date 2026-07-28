// Fold persisted concierge messages into the model-side transcript, giving the
// agent MEMORY OF ITS OWN TOOL WORK across turns (gate round-2 finding 1/2). Each
// stored message may carry draft_ref/action_ref; we surface their ids/status as a
// bracketed note so next turn the model can, e.g., propose sending a proposal it
// drafted earlier — without asking the planner for a UUID. Consecutive same-role
// rows (a turn's text + its card rows) merge into one message so the Messages API
// sees a clean, alternating transcript.
//
// row: { role: 'planner'|'concierge', content, draft_ref, action_ref }
export function foldHistory(rows) {
  const mapped = (rows ?? []).map((m) => {
    let content = m.content || "";
    const dr = m.draft_ref;
    const ar = m.action_ref;
    if (dr && dr.id) content = join(content, `[created draft ${dr.kind} id=${dr.id} "${dr.title ?? ""}"]`);
    if (ar && ar.fn) content = join(content, `[proposed action ${ar.fn} args=${JSON.stringify(ar.args ?? {})} status=${ar.status ?? "pending"}]`);
    return { role: m.role === "concierge" ? "assistant" : "user", content };
  });
  const merged = [];
  for (const m of mapped) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content = join(last.content, m.content);
    else merged.push({ role: m.role, content: m.content });
  }
  return merged.filter((m) => m.content && m.content.trim());
}

function join(a, b) {
  if (!b) return a;
  if (!a) return b;
  return `${a}\n${b}`;
}
