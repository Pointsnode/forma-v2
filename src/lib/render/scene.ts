import "server-only";

// "Set the scene" — the AI concept-render engine. OpenAI Images API, model gpt-image-2,
// called over REST with fetch (no SDK, no new deps). Server-only: the key is read here and
// never reaches a client component. If the key is unset the whole feature stays dark.

const OPENAI_IMAGES_EDITS = "https://api.openai.com/v1/images/edits";
const MODEL = "gpt-image-2";

// The cost-guard constants live in a pure module (single source, client-safe); re-exported
// here so server callers keep a single import surface.
import { MAX_REF_IMAGES } from "./limits.mjs";
export { RENDERS_PER_WEDDING, RENDERS_PER_DAY, MAX_REF_IMAGES } from "./limits.mjs";

// The fixed style scaffold, kept as ONE constant so the wording can be tuned at the gate.
// It frames the guide's ingredients as a single editorial concept photograph, and forbids
// text/faces so the impression stays a mood, never a fake vendor shot or a person's likeness.
export const SCENE_SCAFFOLD =
  "One photorealistic editorial photograph of this wedding concept: the tablescape and space it evokes, styled as a cohesive scene. Natural light, shallow depth of field, elegant and restrained. No text, no logos, no people's faces. This is a concept impression of the direction, not a photograph of specific rentals.";

export function hasOpenAIKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// Assemble the prompt server-side from the guide's own ingredients + the fixed scaffold.
export function buildScenePrompt(input: {
  title: string;
  category: string | null;
  items: { title: string; note: string | null }[];
  palette: string[];
  city: string | null;
}): string {
  const parts: string[] = [SCENE_SCAFFOLD];
  parts.push(`The concept is titled "${input.title}"${input.category ? ` (${input.category})` : ""}.`);
  const ingredients = input.items
    .map((i) => (i.note ? `${i.title} (${i.note})` : i.title))
    .filter(Boolean)
    .slice(0, 24);
  if (ingredients.length) parts.push(`It draws on: ${ingredients.join("; ")}.`);
  if (input.palette.length) parts.push(`The palette: ${input.palette.join(" ")}.`);
  if (input.city) parts.push(`The wedding is in ${input.city}.`);
  return parts.join(" ");
}

// The single REST call. Reference images are forwarded as image[] on the edits endpoint;
// gpt-image-2 returns the composed image as base64. Throws on a non-ok response or a missing
// key so the caller can surface the quiet error line. `signal` carries the route's timeout.
export async function composeScene(opts: {
  prompt: string;
  images: { data: Buffer; contentType: string }[];
  signal?: AbortSignal;
}): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY unset");

  const form = new FormData();
  form.append("model", MODEL);
  form.append("prompt", opts.prompt);
  form.append("size", "1536x1024"); // landscape editorial frame
  form.append("quality", "medium"); // a few cents per render
  form.append("n", "1");
  opts.images.slice(0, MAX_REF_IMAGES).forEach((img, i) => {
    const ext = img.contentType.includes("png") ? "png" : "jpg";
    form.append("image[]", new Blob([new Uint8Array(img.data)], { type: img.contentType }), `ref-${i}.${ext}`);
  });

  const res = await fetch(OPENAI_IMAGES_EDITS, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: opts.signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`gpt-image-2 ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-2 returned no image");
  return Buffer.from(b64, "base64");
}
