import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatePrefs, DateFormat } from "@/lib/format-date";

// Load the signed-in account's date-rendering preferences (§B4). Locale comes from the
// URL (the request locale); timezone + date_format come from the profile. Falls back to
// the studio-grid zone + 'auto' when the row or columns are unreadable, so a caller
// always gets a usable DatePrefs.
export async function loadDatePrefs(supabase: SupabaseClient, locale: string): Promise<DatePrefs> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let tz = "America/Mexico_City";
  let format: DateFormat = "auto";
  if (user) {
    const { data } = await supabase.from("profiles").select("timezone, date_format").eq("id", user.id).maybeSingle();
    if (data) {
      tz = (data.timezone as string) || tz;
      format = ((data.date_format as DateFormat) ?? "auto") || "auto";
    }
  }
  return { locale, tz, format };
}
