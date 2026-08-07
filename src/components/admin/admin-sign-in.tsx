"use client";

import { useActionState } from "react";
import { DomainStar } from "@/components/ui";
import { adminSignIn, type AdminAuthState } from "@/app/(admin)/admin/actions";

// Brand-styled sign-in for /admin: star medallion, no marketing chrome. Rendered by the
// admin layout at the SAME url on a signed-out visit (no redirect, no leak).
export function AdminSignIn() {
  const [state, action, pending] = useActionState<AdminAuthState, FormData>(adminSignIn, null);
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form action={action} className="w-full max-w-[340px] text-center">
        <div className="flex justify-center"><DomainStar size={26} /></div>
        <h1 className="mt-4 font-display text-[22px] text-ink">Forma Admin</h1>
        <p className="mt-1 text-[13px] text-text-meta">Sign in to continue.</p>
        <input name="email" type="email" required placeholder="Email" autoComplete="email"
          className="mt-5 w-full rounded-[var(--radius)] border border-hairline-token bg-surface-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:ring-1 focus:ring-teal" />
        <input name="password" type="password" required placeholder="Password" autoComplete="current-password"
          className="mt-2.5 w-full rounded-[var(--radius)] border border-hairline-token bg-surface-card px-3.5 py-2.5 text-[14px] text-ink outline-none focus:ring-1 focus:ring-teal" />
        {state?.error ? <p className="mt-2.5 text-[12.5px] text-[color:var(--color-text-danger)]">That did not work. Check your email and password.</p> : null}
        <button type="submit" disabled={pending}
          className="mt-4 w-full rounded-[var(--radius)] bg-ink px-4 py-2.5 text-[13px] font-medium text-bone disabled:opacity-60">
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
