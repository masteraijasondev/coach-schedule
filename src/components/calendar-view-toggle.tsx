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
  tour,
}: {
  view: CalendarView;
  monthHref: string;
  weekHref: string;
  onViewChange: (view: CalendarView) => void;
  tour?: string;
}) {
  const itemClass = (active: boolean) =>
    [
      "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]",
      active
        ? "bg-[#2C2C2C] text-white"
        : "text-[#2C2C2C] hover:bg-stone-100",
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
      data-tour={tour}
    >
      <Link
        href={monthHref}
        role="tab"
        aria-selected={view === "month"}
        className={itemClass(view === "month")}
        onClick={(event) => selectView(event, "month")}
      >
        月曆
      </Link>
      <Link
        href={weekHref}
        role="tab"
        aria-selected={view === "week"}
        className={itemClass(view === "week")}
        onClick={(event) => selectView(event, "week")}
      >
        週曆
      </Link>
    </div>
  );
}
