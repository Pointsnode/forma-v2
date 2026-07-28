// Within-column ordering (exceptions-first, the cockpit law): FLAGGED rises above
// OVERDUE, which rises above the rest; then by due date ascending, undated last.
// Completed cards never count as flagged/overdue. Pure — shared by the loader and
// the logic test.
export function taskRank(card, today) {
  if (card.status === "completed") return 3;
  if (card.flagged) return 0;
  if (card.due_date && card.due_date < today) return 1;
  return 2;
}

export function compareTasks(a, b, today) {
  const ra = taskRank(a, today), rb = taskRank(b, today);
  if (ra !== rb) return ra - rb;
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return 0;
}
