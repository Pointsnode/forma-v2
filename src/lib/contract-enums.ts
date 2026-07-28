// UI-facing contract enums, mirroring the §7 Postgres enums (0007). Client
// components render selects from these; i18n keys follow the value, e.g.
// templateKind_<v>, mergeSource_<v>, role_<v>.
export const TEMPLATE_KINDS = ["full", "partial", "day_of", "rider"] as const;
export const CONTRACT_KINDS = ["planner_agreement", "vendor", "venue"] as const;
export const MERGE_SOURCES = [
  "couple_names", "event_ref", "venue_restrictions", "quote_amount",
  "ledger_schedule", "workspace_profile", "vendor_contact", "manual",
] as const;
export const SIGNER_ROLES = ["couple", "planner", "vendor"] as const;

export type TemplateKind = (typeof TEMPLATE_KINDS)[number];
export type ContractKind = (typeof CONTRACT_KINDS)[number];
export type MergeSource = (typeof MERGE_SOURCES)[number];
export type SignerRole = (typeof SIGNER_ROLES)[number];
