// Substitute {field_key} placeholders in a contract body with the field's value
// (manual_value ?? resolved_value). Unresolved keys stay visibly un-filled (the
// literal {key}) so a draft reads honestly; a sent contract's frozen values show.
// Pure — shared by the planner room (server) and the signer page (client).
export function substituteBody(body: string, values: Record<string, string | null | undefined>): string {
  if (!body) return "";
  return body.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, key) => {
    const v = values[key];
    return v != null && v !== "" ? v : m;
  });
}
