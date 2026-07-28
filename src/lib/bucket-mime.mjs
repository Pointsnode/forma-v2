// Single source of truth for the M6 buckets' allowed mime types — bound to the
// storage SQL by bucket-mime.logic.test.mjs (the M5 lesson: every bucket's mime
// list is test-bound to what the code uploads). contract-artifacts keeps its own
// constant in contract-artifact-mime.mjs.
export const WEDDING_DOCS_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"];
export const DESIGN_MEDIA_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// M10 planner-profiles (public bucket): photographs only — the directory is
// photography-led, so no gifs, no pdfs; just the three web hero/gallery formats.
export const PLANNER_PROFILES_MIMES = ["image/jpeg", "image/png", "image/webp"];

// Browser <input accept> hints (not security — the bucket list is the gate).
export const WEDDING_DOCS_ACCEPT = "application/pdf,image/*,text/plain";
export const DESIGN_MEDIA_ACCEPT = "image/*";
export const PLANNER_PROFILES_ACCEPT = "image/jpeg,image/png,image/webp";
