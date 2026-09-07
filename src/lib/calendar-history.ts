"use client";

import { parseDayParam, parseMinuteParam } from "@/lib/calendar";
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

export function replaceCalendarHref(href: string) {
  window.history.replaceState(null, "", href);
}

export function scrollToCalendarDay() {
  document.getElementById("day")?.scrollIntoView({ block: "start" });
}
