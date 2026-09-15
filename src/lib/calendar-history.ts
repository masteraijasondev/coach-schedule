"use client";

import {
  availabilityWeekStart,
  parseAvailabilityWeekParam,
  parseCalendarView,
  parseDayParam,
  parseMinuteParam,
  type CalendarView,
} from "@/lib/calendar";
import { useEffect, useState, type MouseEvent } from "react";

export type CalendarSelection = {
  day: string;
  coachId?: string;
  slotStart: number | null;
  slotEnd: number | null;
};

export function useCalendarSelection(
  month: string,
  initial: CalendarSelection,
  clampDayToMonth = true,
): [CalendarSelection, (next: CalendarSelection) => void] {
  const [selection, setSelection] = useState(initial);

  useEffect(() => {
    function onPop() {
      const params = new URLSearchParams(window.location.search);
      const rawDay = params.get("day") ?? undefined;
      const day =
        clampDayToMonth
          ? parseDayParam(rawDay, month)
          : rawDay && /^\d{4}-\d{2}-\d{2}$/.test(rawDay)
            ? rawDay
            : initial.day;
      setSelection({
        day,
        coachId: params.get("coach") || undefined,
        slotStart: parseMinuteParam(params.get("slotStart")),
        slotEnd: parseMinuteParam(params.get("slotEnd")),
      });
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [clampDayToMonth, initial.day, month]);

  return [selection, setSelection];
}

export function isModifiedClick(event: MouseEvent): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

export function pushCalendarHref(href: string) {
  window.history.pushState(null, "", href);
}

export function calendarHrefFromLocation(
  patch: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
}

export function applyCalendarView(view: CalendarView): string {
  const params = new URLSearchParams(window.location.search);
  const day = params.get("day") ?? undefined;
  if (view === "week") {
    params.set("view", "week");
    params.set("week", availabilityWeekStart(day));
  } else {
    params.delete("view");
  }
  const query = params.toString();
  const href = `${window.location.pathname}${query ? `?${query}` : ""}`;
  pushCalendarHref(href);
  return href;
}

export function useCalendarView(
  initialView: CalendarView,
): [CalendarView, (view: CalendarView) => void] {
  const [view, setView] = useState(initialView);

  useEffect(() => {
    function onPop() {
      const params = new URLSearchParams(window.location.search);
      setView(parseCalendarView(params.get("view") ?? undefined));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return [view, setView];
}

export function readCalendarCoachId(): string | undefined {
  return new URLSearchParams(window.location.search).get("coach") || undefined;
}

export function readCalendarWeek(fallbackDay?: string): string {
  const params = new URLSearchParams(window.location.search);
  return parseAvailabilityWeekParam(
    params.get("week") ?? params.get("day") ?? fallbackDay,
  );
}

export function replaceCalendarHref(href: string) {
  window.history.replaceState(null, "", href);
}

export function scrollToCalendarDay() {
  document.getElementById("day")?.scrollIntoView({ block: "start" });
}
