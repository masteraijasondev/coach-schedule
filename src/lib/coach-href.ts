import type { CalendarView } from "@/lib/calendar";

export function coachCalendarHref(params: {
  month?: string;
  day?: string;
  week?: string;
  view?: CalendarView;
  hash?: string;
}): string {
  const query = new URLSearchParams();
  if (params.month) {
    query.set("month", params.month);
  }
  if (params.day) {
    query.set("day", params.day);
  }
  if (params.week) {
    query.set("week", params.week);
  }
  if (params.view === "week") {
    query.set("view", "week");
  }
  const serialized = query.toString();
  const path = serialized ? `/coach?${serialized}` : "/coach";
  return params.hash ? `${path}#${params.hash}` : path;
}
