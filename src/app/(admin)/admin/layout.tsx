import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { adminGate } from "@/lib/admin/guard";
import { AdminSignIn } from "@/components/admin/admin-sign-in";
import { AdminShell } from "@/components/admin/admin-shell";

// Auth-dependent — never statically cached.
export const dynamic = "force-dynamic";

// The server-side door (middleware is defense-in-depth, not the last line): a signed-out
// visitor sees the sign-in screen at this URL; a signed-in non-admin gets a plain 404; a
// platform admin gets the shell.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const gate = await adminGate();
  if (gate.state === "signed-out") return <AdminSignIn />;
  if (gate.state === "forbidden") notFound();
  return <AdminShell role={gate.role}>{children}</AdminShell>;
}
