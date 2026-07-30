// Shared error map for the vendor-ledger surface (§J). Maps a Postgres SQLSTATE to a
// key in the "errors" i18n namespace. FV241 is deliberately absent — it carries the
// database's own transition message, shown verbatim. Any unmapped code also falls
// back to the raw DB message; a blank "Couldn't save" is never acceptable here.
const MAP: Record<string, string> = {
  FV000: "gone",         // "That record is gone."
  FV230: "notStaff",     // "Only the planner's team can do that."
  FV243: "ownCatalogue", // "You can only present vendors from your own catalogue."
  FV244: "venueEvent",   // "A venue has to be presented for at least one event."
  FV222: "changeNote",   // "Tell them what you'd like changed."
  FS050: "clearance",    // "Your role doesn't allow that." (M15 clearance box gate)
};

/** i18n key in the "errors" namespace for a code, or null → caller uses the DB message. */
export function formaErrorKey(code?: string | null): string | null {
  return code ? MAP[code] ?? null : null;
}

/** Resolve an action result to a human string. `t` is useTranslations("errors").
    Order: mapped code → DB message (for FV241 + unknown) → generic. */
export function formaErrorMessage(
  result: { error?: string | null; message?: string | null } | null | undefined,
  t: (key: string) => string,
): string | null {
  if (!result?.error) return null;
  const key = formaErrorKey(result.error);
  if (key) return t(key);
  return result.message?.trim() || t("generic");
}
