import { NextResponse, type NextRequest } from "next/server";
import { runLeadSweep } from "@/lib/leads-sweep";

// Hourly lead-automation sweep. Guarded by CRON_SECRET (accepts Vercel Cron's Bearer header
// or x-cron-secret); fail-closed 401 without it. This is NOT an anon surface — the matrix is
// unchanged at 12. The service-role work is isolated in @/lib/leads-sweep (allowlisted).
export const dynamic = "force-dynamic";

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const header = req.headers.get("x-cron-secret");
  if (!secret || (auth !== `Bearer ${secret}` && header !== secret)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  try {
    const r = await runLeadSweep();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("lead sweep failed", e);
    return new NextResponse("error", { status: 500 });
  }
}

export const GET = run;
export const POST = run;
