// M16a concierge error codes (§I). FC0xx is a clean, previously-unused prefix (the DB uses
// FD/FL/FM/FO/FS/FT/FV). These are thrown INSIDE tool handlers; the agent loop catches a tool
// error and hands the message to the model, which relays it in the planner's language — the
// same path every FV* tool message already takes. Registered in forma-error's MAP too, so the
// codes are one registry (a UI surfacing them renders the errors-namespace string).
export const CONCIERGE_MESSAGES = {
  FC010: "That wedding isn't in your studio.",
  FC011: "Which wedding should I look at?",
  FC012: "I found a few — which one?",
  FS050: "Your role doesn't allow that.",
} as const;

export type ConciergeCode = keyof typeof CONCIERGE_MESSAGES;

export class ConciergeError extends Error {
  code: ConciergeCode;
  constructor(code: ConciergeCode) {
    super(CONCIERGE_MESSAGES[code]);
    this.code = code;
    this.name = "ConciergeError";
  }
}

// Throw helper — `never` return lets call sites use it as an expression guard.
export function conciergeError(code: ConciergeCode): never {
  throw new ConciergeError(code);
}
