import type { CalendarView } from "@/lib/calendar";

export type CoachScheduleScope = "self" | "all";

export const COACH_SCHEDULE_SCOPE_EVENT = "coach-schedule-scope";

export function parseCoachScheduleScope(
  raw: string | null | undefined,
): CoachScheduleScope {
  return raw === "self" ? "self" : "all";
}

export function coachCalendarHref(params: {
  month?: string;
  day?: string;
  week?: string;
  view?: CalendarView;
  scope?: CoachScheduleScope;
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
  if (params.scope === "self") {
    query.set("scope", "self");
  }
  const serialized = query.toString();
  const path = serialized ? `/coach?${serialized}` : "/coach";
  return params.hash ? `${path}#${params.hash}` : path;
}
