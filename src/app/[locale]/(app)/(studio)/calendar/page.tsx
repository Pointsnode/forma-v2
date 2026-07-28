import { getLocale, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadCalendar } from "@/lib/calendar";
import { zonedDateKey } from "@/lib/calendar-grid.mjs";
import { calendlyConfigured } from "@/lib/calendly/api";
import { CalendarView } from "./calendar-view";

// Renders from Forma's OWN stored rows (meetings + wedding days + due work) — never
// Calendly's API at render (the fetch-and-forget fix). Meetings are bucketed in the
// connection's timezone; today is computed there too, so the grid is internally
// consistent. force-dynamic: always the live rows (a fresh booking shows at once).
export const dynamic = "force-dynamic";

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const lang = await getLocale();
  const supabase = await createClient();
  const data = await loadCalendar(supabase);
  const todayKey = zonedDateKey(new Date(), data.timezone);
  const sp = await searchParams;
  const banner = sp.connected ? "connected" : sp.error ? "error" : null;

  return (
    <CalendarView
      entries={data.entries}
      timezone={data.timezone}
      connected={data.connected}
      userUri={data.userUri}
      todayKey={todayKey}
      weekStart={lang === "es" ? 1 : 0}
      configured={calendlyConfigured()}
      locale={lang}
      banner={banner}
    />
  );
}
