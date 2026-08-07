// The glyph law (pure): a menu option's LETTER is its 0-based index in `sort` order (a, b, c…),
// lowercase. No column — derived everywhere the options are sort-ordered.
export function menuLetter(sortIndex) {
  return String.fromCharCode(97 + (((sortIndex % 26) + 26) % 26));
}

// The glyph VARIANT for a guest's plate: a chosen option shows its letter (the "dietary"
// double-ring when the guest's dietary field is non-empty); no choice shows the dashed empty
// circle (unchosen / empty seat).
export function plateVariant(choiceId, dietary) {
  if (!choiceId) return "empty";
  return dietary && String(dietary).trim() ? "dietary" : "standard";
}

// Plate counts across a set of guests: {letter: count} for chosen options, plus unchosen (a
// seated/yes guest with no choice) and dietary (non-empty dietary among the chosen).
export function plateCounts(guests, letterOf) {
  const byLetter = {};
  let unchosen = 0, dietary = 0;
  for (const g of guests) {
    const letter = g.choiceId ? letterOf(g.choiceId) : null;
    if (letter) {
      byLetter[letter] = (byLetter[letter] ?? 0) + 1;
      if (g.dietary && String(g.dietary).trim()) dietary++;
    } else if (g.rsvp === "yes") {
      unchosen++;
    }
  }
  return { byLetter, unchosen, dietary };
}
