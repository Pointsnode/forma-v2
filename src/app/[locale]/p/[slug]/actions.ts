"use server";

import { createClient } from "@/lib/supabase/server";

export type InquiryInput = {
  name: string;
  partner: string;
  email: string;
  phone: string;
  date: string; // yyyy-mm-dd or ""
  message: string;
  honeypot: string;
};

export type InquiryResult = { ok?: boolean; error?: string };

// The one anon write of M10 — submit_inquiry (the matrix's 10th function). Runs on
// the RLS anon client; all validation, honeypot, and rate-limiting live in the DB
// function, so the action stays a thin pass-through and returns its human errcode.
export async function submitInquiry(slug: string, input: InquiryInput): Promise<InquiryResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_inquiry", {
    p_slug: slug,
    p_name: input.name,
    p_partner: input.partner,
    p_email: input.email,
    p_phone: input.phone,
    p_date: input.date || null,
    p_message: input.message,
    p_honeypot: input.honeypot,
  });
  if (error) return { error: error.code || "generic" };
  return { ok: true };
}
