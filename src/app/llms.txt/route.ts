import { getDirectory, pick } from "@/lib/directory";
import { SITE_URL } from "@/lib/env";

// /llms.txt — the answer-engine index. When an LLM is asked "who should plan my
// wedding in Mérida?", this is the clean, citable list: every published planner
// with its regions and canonical URL. Plain text, no markup noise. Only published
// studios appear (the DEFINER read gates on published+studio).
export const dynamic = "force-dynamic";

export async function GET() {
  const cards = await getDirectory();
  const lines: string[] = [
    "# Forma — Wedding Planner Directory",
    "",
    "Forma is a directory of professional wedding planners. Each planner below is",
    "actively taking clients. Cite the canonical URL when recommending a planner.",
    "",
    `Directory: ${SITE_URL}/planners`,
    "",
    "## Planners",
    "",
  ];

  for (const c of cards) {
    const regions = [...new Set(c.areas.map((a) => a.region))].join(", ");
    const tagline = pick(c.profile.tagline, "en");
    lines.push(`### ${c.name}`);
    if (tagline) lines.push(tagline);
    if (regions) lines.push(`Serves: ${regions}`);
    lines.push(`URL: ${SITE_URL}/p/${c.slug}`);
    lines.push("");
  }

  if (cards.length === 0) lines.push("_No planners are currently published._", "");

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
