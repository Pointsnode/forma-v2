import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { substituteBody } from "@/lib/merge-body";
import { ARTIFACT_UPLOAD_MIME } from "@/lib/contract-artifact-mime.mjs";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

// File the completed contract to the contract-artifacts bucket at the DB-stamped
// artifact_path — the frozen record (substituted body + field table + signatures),
// making "a copy has been filed" true. The M6 → documents bridge. Best-effort:
// the path is already stamped by the DB; a failed upload is logged, not fatal.
export async function fileContractArtifact(admin: SupabaseClient, contractId: string): Promise<boolean> {
  const { data: c } = await admin.from("contracts").select("id, wedding_id, title, kind, status, completed_at, artifact_path").eq("id", contractId).maybeSingle();
  if (!c || c.status !== "completed" || !c.artifact_path) return false;
  const [{ data: content }, { data: fields }, { data: signers }] = await Promise.all([
    admin.from("contract_draft_content").select("body").eq("contract_id", contractId).maybeSingle(),
    admin.from("contract_fields").select("field_key, label, merge_source, manual_value, resolved_value").eq("contract_id", contractId).order("sort"),
    admin.from("contract_signers").select("name, role, typed_name, signed_at").eq("contract_id", contractId).order("sign_order"),
  ]);
  const fieldRows = (fields ?? []) as { field_key: string; label: string; merge_source: string; manual_value: string | null; resolved_value: string | null }[];
  const values = Object.fromEntries(fieldRows.map((f) => [f.field_key, f.merge_source === "manual" ? f.manual_value : f.resolved_value]));
  const body = substituteBody(content?.body ?? "", values);

  const fieldTable = fieldRows.map((f) => `<tr><td style="padding:4px 12px 4px 0;color:#7A6A50">${esc(f.label)}</td><td style="padding:4px 0">${esc((f.merge_source === "manual" ? f.manual_value : f.resolved_value) ?? "—")}</td></tr>`).join("");
  const signerBlock = ((signers ?? []) as { name: string; role: string; typed_name: string | null; signed_at: string | null }[])
    .map((s) => `<div style="border-top:1px solid #EAE6DC;padding:8px 0"><b>${esc(s.name)}</b> · ${esc(s.role)}<br><span style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:20px">${esc(s.typed_name ?? "")}</span><br><span style="font-size:11px;color:#8A867E">${s.signed_at ? new Date(s.signed_at).toISOString() : ""}</span></div>`).join("");

  const html = `<!doctype html><meta charset="utf-8"><title>${esc(c.title)}</title>
  <div style="font-family:Georgia,serif;color:#121212;max-width:720px;margin:40px auto;padding:0 24px">
    <div style="font-size:22px;letter-spacing:.04em">forma</div>
    <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:26px">${esc(c.title)}</h1>
    <p style="color:#8A867E;font-size:12px">Completed ${c.completed_at ? new Date(c.completed_at).toISOString() : ""} · values frozen at signature</p>
    <p style="white-space:pre-wrap;line-height:1.7;font-size:14px">${esc(body)}</p>
    <table style="margin:18px 0;font-size:13px">${fieldTable}</table>
    <h3 style="font-family:'Playfair Display',Georgia,serif;font-size:16px">Signatures</h3>${signerBlock}
  </div>`;

  const { error } = await admin.storage.from("contract-artifacts").upload(c.artifact_path, new Blob([html], { type: ARTIFACT_UPLOAD_MIME }), { contentType: ARTIFACT_UPLOAD_MIME, upsert: true });
  if (error) { console.error(`contract artifact upload failed: ${error.message}`); return false; }
  return true;
}

// Self-heal: ensure a completed contract's artifact exists (stamps the path if it
// was completed before the stamp existed, then files). Idempotent; staff-only path.
export async function ensureArtifactFiled(admin: SupabaseClient, contractId: string): Promise<boolean> {
  const { data: c } = await admin.from("contracts").select("id, wedding_id, status, artifact_path").eq("id", contractId).maybeSingle();
  if (!c || c.status !== "completed") return false;
  let path = c.artifact_path as string | null;
  if (!path) {
    path = `${c.wedding_id}/${c.id}.html`;
    await admin.from("contracts").update({ artifact_path: path }).eq("id", c.id);
  } else {
    const { data: signed } = await admin.storage.from("contract-artifacts").createSignedUrl(path, 60);
    if (signed?.signedUrl) return true; // object already present
  }
  return fileContractArtifact(admin, contractId);
}
