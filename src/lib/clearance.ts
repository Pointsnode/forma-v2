// Clearance boxes (M15) — the stable string keys stored in workspace_members.grants.
// NEVER rename these; they live in the database. Client-safe (pure): drives the box
// grid, presets, and UI gating. Authority is enforced in the function lane (law 2);
// this only decides what the UI offers. 'admin' implies every box.
export const CLEARANCE_BOXES = [
  "admin", "weddings", "couples", "vendors", "contracts", "send",
  "ledger", "profile", "calendly", "tasks", "dayof", "concierge",
] as const;
export type ClearanceKey = (typeof CLEARANCE_BOXES)[number];

export function hasClearance(grants: string[] | null | undefined, key: string): boolean {
  const g = grants ?? [];
  return g.includes("admin") || g.includes(key);
}

// Preset chips (§C) — pure UI sugar; only the resulting grants array is stored.
export const PRESETS: { key: string; grants: ClearanceKey[] }[] = [
  { key: "admin", grants: [...CLEARANCE_BOXES] },
  { key: "planner", grants: CLEARANCE_BOXES.filter((k) => k !== "admin") },
  { key: "dayof", grants: ["tasks", "dayof"] },
  { key: "vendor", grants: ["vendors"] },
];
