import type { CalendarView } from "@/lib/calendar";

export function employerCalendarHref(params: {
  month?: string;
  day?: string;
  coach?: string;
  week?: string;
  listWeek?: string;
  slotStart?: string | number;
  slotEnd?: string | number;
  view?: CalendarView;
}): string {
  const query = new URLSearchParams();
  if (params.month) {
    query.set("month", params.month);
  }
  if (params.day) {
    query.set("day", params.day);
  }
  if (params.coach) {
    query.set("coach", params.coach);
  }
  if (params.week) {
    query.set("week", params.week);
  }
  if (params.listWeek) {
    query.set("listWeek", params.listWeek);
  }
  if (params.slotStart != null && params.slotStart !== "") {
    query.set("slotStart", String(params.slotStart));
  }
  if (params.slotEnd != null && params.slotEnd !== "") {
    query.set("slotEnd", String(params.slotEnd));
  }
  if (params.view === "week") {
    query.set("view", "week");
  }
  const serialized = query.toString();
  return serialized ? `/employer?${serialized}` : "/employer";
}
