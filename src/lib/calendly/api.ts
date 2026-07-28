import "server-only";
import { randomBytes } from "node:crypto";

// Calendly REST client (no SDK — the Stripe precedent: fetch + explicit shapes).
// Used only OFF the render path (OAuth connect, backfill, disconnect); page render
// reads the stored `meetings` rows, never Calendly. If the app isn't configured
// (dev/preview before Gio wires the OAuth app), callers see `configured()===false`.

const AUTH_BASE = "https://auth.calendly.com";
const API_BASE = "https://api.calendly.com";

export function calendlyConfigured(): boolean {
  return !!(process.env.CALENDLY_CLIENT_ID && process.env.CALENDLY_CLIENT_SECRET);
}

export type Tokens = { accessToken: string; refreshToken: string; expiresAt: string; ownerUri?: string; orgUri?: string };

function tokenExpiry(expiresInSec: number): string {
  // refresh a minute early to avoid edge expiry mid-call
  return new Date(Date.now() + Math.max(0, expiresInSec - 60) * 1000).toISOString();
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.CALENDLY_CLIENT_ID!,
      client_secret: process.env.CALENDLY_CLIENT_SECRET!,
      ...body,
    }).toString(),
  });
  if (!res.ok) throw new Error(`calendly token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number; owner?: string; organization?: string };
  return { accessToken: d.access_token, refreshToken: d.refresh_token, expiresAt: tokenExpiry(d.expires_in), ownerUri: d.owner, orgUri: d.organization };
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({ client_id: process.env.CALENDLY_CLIENT_ID!, response_type: "code", redirect_uri: redirectUri, state });
  return `${AUTH_BASE}/oauth/authorize?${p.toString()}`;
}

export function exchangeCode(code: string, redirectUri: string): Promise<Tokens> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function refreshTokens(refreshToken: string): Promise<Tokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

async function api<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`calendly ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

export async function getMe(accessToken: string): Promise<{ uri: string; orgUri: string; timezone: string }> {
  const d = await api<{ resource: { uri: string; current_organization: string; timezone: string } }>(accessToken, "/users/me");
  return { uri: d.resource.uri, orgUri: d.resource.current_organization, timezone: d.resource.timezone };
}

// Create an org-scoped subscription for invitee.created/canceled. We generate the
// signing key and hand it to Calendly (it signs subsequent webhooks with it); we
// store it encrypted. Returns the subscription URI + the signing key to persist.
export async function createWebhookSubscription(
  accessToken: string,
  opts: { orgUri: string; userUri: string; callbackUrl: string },
): Promise<{ subscriptionUri: string; signingKey: string }> {
  const signingKey = randomBytes(32).toString("hex");
  const d = await api<{ resource: { uri: string } }>(accessToken, "/webhook_subscriptions", {
    method: "POST",
    body: JSON.stringify({
      url: opts.callbackUrl,
      events: ["invitee.created", "invitee.canceled"],
      organization: opts.orgUri,
      scope: "organization",
      signing_key: signingKey,
    }),
  });
  return { subscriptionUri: d.resource.uri, signingKey };
}

export async function deleteWebhookSubscription(accessToken: string, subscriptionUri: string): Promise<void> {
  // subscriptionUri is a full URL; DELETE it directly.
  const res = await fetch(subscriptionUri, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok && res.status !== 404) throw new Error(`calendly delete webhook ${res.status}`);
}

export type CalendlyEvent = {
  uri: string;
  name?: string;
  status?: string;
  start_time: string;
  end_time?: string;
  location?: { join_url?: string };
};
export type CalendlyInvitee = { uri: string; name?: string; email?: string; status?: string; cancel_url?: string; reschedule_url?: string };

// Backfill: upcoming + recent scheduled events for the org, plus each event's
// invitee, so the grid isn't empty on day one.
export async function listScheduledEvents(accessToken: string, orgUri: string, minStart: string): Promise<CalendlyEvent[]> {
  const p = new URLSearchParams({ organization: orgUri, min_start_time: minStart, count: "100", status: "active" });
  const d = await api<{ collection: CalendlyEvent[] }>(accessToken, `/scheduled_events?${p.toString()}`);
  return d.collection ?? [];
}

export async function listEventInvitees(accessToken: string, eventUri: string): Promise<CalendlyInvitee[]> {
  const d = await api<{ collection: CalendlyInvitee[] }>(accessToken, `${eventUri.replace(API_BASE, "")}/invitees?count=100`);
  return d.collection ?? [];
}
