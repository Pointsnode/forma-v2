// The single source of truth binding what the filing code UPLOADS to what the
// contract-artifacts bucket ALLOWS. The storage bucket's allowed_mime_types
// (supabase/storage/contract-artifacts.sql) must equal ARTIFACT_ALLOWED_MIMES, and
// the upload content-type must be one of them — asserted by the logic test, so the
// mime mismatch that swallowed a real filing can't recur.
export const ARTIFACT_UPLOAD_MIME = "text/html";
export const ARTIFACT_ALLOWED_MIMES = ["application/pdf", "text/html"];
