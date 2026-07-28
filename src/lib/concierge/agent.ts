import "server-only";
import { CONCIERGE_API_KEY, CONCIERGE_API_URL, CONCIERGE_MODEL, CONCIERGE_MAX_TOKENS } from "./config";

// Minimal Anthropic Messages client + agentic loop — fetch only, no SDK (the
// stripe-without-SDK house pattern). The wedding/orchestrator context is a cached
// system block (identical across turns → prompt caching pays for itself).

export type ChatMessage = { role: "user" | "assistant"; content: unknown };
export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
export type ToolExec = (name: string, input: Record<string, unknown>) => Promise<{ content: string; draft?: DraftRef }>;
export type DraftRef = { kind: string; id: string; title: string };

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };
type ApiResponse = { content: Block[]; stop_reason: string; usage: { input_tokens: number; output_tokens: number } };

async function callAnthropic(system: string, messages: ChatMessage[], tools: ToolDef[]): Promise<ApiResponse> {
  const res = await fetch(CONCIERGE_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": CONCIERGE_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CONCIERGE_MODEL,
      max_tokens: CONCIERGE_MAX_TOKENS,
      // cache the (large, stable) context block across turns
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
      tools,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`concierge model ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as ApiResponse;
}

export type TurnResult = { text: string; drafts: DraftRef[]; tokensIn: number; tokensOut: number };

// Run one planner turn to completion: the model may call read/write tools; we
// execute them (each already RLS/staff-scoped) and loop until it answers. Draft
// tools surface their created object as a DraftRef for the panel's draft card.
export async function runConciergeTurn(opts: {
  system: string;
  history: ChatMessage[];
  userText: string;
  tools: ToolDef[];
  exec: ToolExec;
  maxSteps?: number;
}): Promise<TurnResult> {
  const messages: ChatMessage[] = [...opts.history, { role: "user", content: opts.userText }];
  const drafts: DraftRef[] = [];
  let tokensIn = 0, tokensOut = 0;
  const maxSteps = opts.maxSteps ?? 6;

  for (let step = 0; step < maxSteps; step++) {
    const res = await callAnthropic(opts.system, messages, opts.tools);
    tokensIn += res.usage?.input_tokens ?? 0;
    tokensOut += res.usage?.output_tokens ?? 0;

    if (res.stop_reason === "tool_use") {
      const toolUses = res.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
      messages.push({ role: "assistant", content: res.content });
      const results: Block[] = [];
      for (const tu of toolUses) {
        try {
          const out = await opts.exec(tu.name, tu.input ?? {});
          if (out.draft) drafts.push(out.draft);
          results.push({ type: "tool_result", tool_use_id: tu.id, content: out.content });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: `error: ${e instanceof Error ? e.message : "failed"}` });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    const text = res.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("").trim();
    return { text, drafts, tokensIn, tokensOut };
  }
  return { text: "", drafts, tokensIn, tokensOut };
}
