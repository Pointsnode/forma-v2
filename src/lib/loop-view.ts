// Client-safe loop types + presentation helpers (no server-only imports).

export type ProposalStatus =
  | "draft" | "sent" | "seen" | "change_requested" | "approved" | "declined" | "withdrawn";
export type Court = "planner" | "couple" | "none";

export type ViewMessage = {
  id: string;
  authorName: string;
  authorInitials: string;
  isCouple: boolean;
  body: string;
};
export type ViewProposal = {
  id: string;
  status: ProposalStatus;
  title: string;
  note: string | null;
  estimate: string | null;
  eventLabel: string | null;
  // Engagement subject (M4): vendor + its linked events → card meta.
  subject: { vendorName: string; eventLabels: string[] } | null;
  court: Court;
  ageDays: number;
  messages: ViewMessage[];
};

export type MemberVM = { id: string; name: string; initials: string; role: string };
export type InviteVM = { id: string; role: string; token: string; expiresAt: string };

// Status → pill tone (maps onto the design tokens; badges only, no borders).
export function statusClass(s: ProposalStatus): string {
  switch (s) {
    case "approved": return "bg-bone text-teal";
    // change_requested = the couple wants changes → needs a hand (wine attention); oxblood
    // is reserved for earned urgency (the floater voice + overdue chips), never a status.
    case "change_requested": return "bg-wine text-bone";
    case "declined": return "bg-bone text-wine";
    case "withdrawn": return "bg-hairline text-muted";
    case "draft": return "bg-bone text-taupe";
    default: return "bg-bone text-wine"; // sent / seen — awaiting couple
  }
}

// Court → who-b bubble tone. planner = sand (yours), couple = wine.
export function courtClass(c: Court): string {
  return c === "planner" ? "bg-champagne text-ink" : c === "couple" ? "bg-wine text-bone" : "bg-hairline text-muted";
}
