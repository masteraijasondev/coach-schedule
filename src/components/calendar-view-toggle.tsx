"use client";

import {
  applyCalendarView,
  isModifiedClick,
} from "@/lib/calendar-history";
import type { CalendarView } from "@/lib/calendar";
import Link from "next/link";
import type { MouseEvent } from "react";

export function CalendarViewToggle({
  view,
  monthHref,
  weekHref,
  onViewChange,
}: {
  view: CalendarView;
  monthHref: string;
  weekHref: string;
  onViewChange: (view: CalendarView) => void;
}) {
  const itemClass = (active: boolean) =>
    [
      "inline-flex min-h-11 min-w-11 items-center justify-center rounded px-3 text-sm sm:min-h-0 sm:py-1.5",
      active
        ? "bg-stone-900 font-medium text-white"
        : "text-stone-700 hover:bg-stone-100",
    ].join(" ");

  function selectView(event: MouseEvent<HTMLAnchorElement>, next: CalendarView) {
    if (isModifiedClick(event)) {
      return;
    }
    event.preventDefault();
    applyCalendarView(next);
    onViewChange(next);
  }

  return (
    <div
      className="inline-flex rounded-md border border-stone-300 p-0.5"
      role="tablist"
      aria-label="日曆檢視"
    >
      <Link
        href={monthHref}
        role="tab"
        aria-selected={view === "month"}
        className={itemClass(view === "month")}
        onClick={(event) => selectView(event, "month")}
      >
        月
      </Link>
      <Link
        href={weekHref}
        role="tab"
        aria-selected={view === "week"}
        className={itemClass(view === "week")}
        onClick={(event) => selectView(event, "week")}
      >
        週
      </Link>
    </div>
  );
}
