"use client";

import { CalendarLegend } from "@/components/calendar-legend";
import { isModifiedClick } from "@/lib/calendar-history";
import Link from "next/link";
import type { MouseEvent } from "react";
import {
  getMonthCells,
  hongKongToday,
  shiftMonth,
} from "@/lib/calendar";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const MAX_VISIBLE_BARS = 5;

type CalendarLesson = {
  id: string;
  coachName: string;
  status?: string;
  timeLabel?: string;
};

type CalendarAvailability = {
  id: string;
  label: string;
  coachName: string;
  timeLabel?: string;
  variant?: "slot" | "leave" | "sick" | "pending" | "confirmed" | "released";
};

type EventBar = {
  id: string;
  text: string;
  variant: "pending" | "confirmed" | "slot" | "leave" | "sick" | "released";
  sortKey: string;
};

const VARIANT_CHIP_CLASS: Record<EventBar["variant"], string> = {
  pending: "bg-emerald-100 text-emerald-950",
  confirmed: "bg-sky-100 text-sky-950",
  slot: "bg-amber-100 text-amber-950",
  leave: "bg-stone-300 text-stone-900",
  sick: "bg-red-100 text-red-900",
  released: "bg-stone-200 text-stone-800",
};

function variantOf(
  variant?: CalendarAvailability["variant"],
  lessonStatus?: string,
): EventBar["variant"] {
  if (
    variant === "leave" ||
    variant === "sick" ||
    variant === "pending" ||
    variant === "confirmed" ||
    variant === "released"
  ) {
    return variant;
  }
  if (lessonStatus === "assigned") {
    return "pending";
  }
  if (lessonStatus === "completed") {
    return "confirmed";
  }
  return "slot";
}

function displayName(name: string, showNames: boolean): string {
  if (!showNames || name === "課堂" || name === "—" || name === "") {
    return "";
  }
  return name;
}

function barFromAvailability(
  item: CalendarAvailability,
  showNames: boolean,
): EventBar {
  const variant = variantOf(item.variant);
  const name = displayName(item.coachName, showNames);
  const absence = variant === "leave" || variant === "sick";
  const text = absence
    ? item.label
    : [item.timeLabel, name].filter(Boolean).join(" ");
  return {
    id: item.id,
    text,
    variant,
    sortKey:
      absence && !item.timeLabel ? "0" : `1-${item.timeLabel ?? item.label}`,
  };
}

function barFromLesson(lesson: CalendarLesson, showNames: boolean): EventBar {
  const variant = variantOf(undefined, lesson.status);
  const name = displayName(lesson.coachName, showNames);
  return {
    id: lesson.id,
    text: [lesson.timeLabel, name].filter(Boolean).join(" "),
    variant,
    sortKey: `1-${lesson.timeLabel ?? ""}`,
  };
}

function cellBars(
  availabilities: CalendarAvailability[],
  lessons: CalendarLesson[],
  showNames: boolean,
): EventBar[] {
  const source =
    availabilities.length > 0
      ? availabilities.map((item) => barFromAvailability(item, showNames))
      : lessons.map((lesson) => barFromLesson(lesson, showNames));
  return source.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

type Props = {
  month: string;
  selectedDay: string;
  basePath: string;
  lessonsByDay: Map<string, CalendarLesson[]>;
  availabilityByDay?: Map<string, CalendarAvailability[]>;
  dayHref?: (day: string) => string;
  monthHref?: (month: string) => string;
  todayHref?: string;
  showNames?: boolean;
  onSelectDay?: (day: string) => void;
  legendItems?: { className: string; label: string }[];
  tour?: string;
};

export function MonthCalendar({
  month,
  selectedDay,
  basePath,
  lessonsByDay,
  availabilityByDay,
  dayHref,
  monthHref,
  todayHref,
  showNames = false,
  onSelectDay,
  legendItems,
  tour,
}: Props) {
  const cells = getMonthCells(month);
  const today = hongKongToday();
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const hrefForMonth = (target: string) =>
    monthHref?.(target) ?? `${basePath}?month=${target}`;
  const hrefForDay = (target: string) =>
    dayHref?.(target) ?? `${basePath}?month=${target.slice(0, 7)}&day=${target}`;
  const hrefForToday =
    todayHref ?? `${basePath}?month=${today.slice(0, 7)}&day=${today}`;
  const viewingToday = selectedDay === today;

  function handleSelectDay(event: MouseEvent<HTMLAnchorElement>, target: string) {
    if (!onSelectDay || isModifiedClick(event) || !target.startsWith(month)) {
      return;
    }
    event.preventDefault();
    onSelectDay(target);
  }

  return (
    <div data-tour={tour} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={hrefForMonth(prev)}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-[#2C2C2C] hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]"
        >
          上月
        </Link>
        <div className="flex items-center gap-3">
          <p className="text-lg font-bold tracking-tight text-stone-950">{month}</p>
          <Link
            href={hrefForToday}
            onClick={(event) => handleSelectDay(event, today)}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-[#2C2C2C] hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]"
            aria-current={viewingToday ? "date" : undefined}
          >
            今日
          </Link>
        </div>
        <Link
          href={hrefForMonth(next)}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-[#2C2C2C] hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]"
        >
          下月
        </Link>
      </div>
      <CalendarLegend items={legendItems} />
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-stone-700">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day) => {
          const inMonth = day.startsWith(month);
          const lessons = lessonsByDay.get(day) ?? [];
          const availabilities = availabilityByDay?.get(day) ?? [];
          const selected = day === selectedDay;
          const isToday = day === today;
          const bars = cellBars(availabilities, lessons, showNames);
          const visible = bars.slice(0, MAX_VISIBLE_BARS);
          const hiddenCount = Math.max(0, bars.length - MAX_VISIBLE_BARS);

          return (
            <Link
              key={day}
              href={hrefForDay(day)}
              onClick={(event) => handleSelectDay(event, day)}
              className={[
                "flex h-36 w-full cursor-pointer flex-col overflow-hidden rounded-md border p-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900",
                inMonth
                  ? "border-slate-300 bg-white text-slate-950"
                  : "border-slate-200 bg-slate-100 text-slate-700",
                selected ? "bg-slate-50 ring-2 ring-slate-950" : "hover:border-slate-400",
              ].join(" ")}
            >
              <div className="flex justify-start">
                <span
                  className={[
                    "inline-flex h-6 w-6 items-center justify-center text-sm font-bold tabular-nums",
                    isToday
                      ? "rounded-full bg-[#FFF6F0] text-[#C2410C] ring-2 ring-[#FF6B00]"
                      : "",
                  ].join(" ")}
                >
                  {Number(day.slice(8))}
                </span>
              </div>
              <div className="mt-0.5 min-h-0 flex-1 space-y-0.5">
                {visible.map((bar) => (
                  <div
                    key={bar.id}
                    title={bar.text}
                    className={`truncate rounded-sm px-1 py-0.5 text-left text-xs font-medium tabular-nums ${VARIANT_CHIP_CLASS[bar.variant]}`}
                  >
                    {bar.text}
                  </div>
                ))}
                {hiddenCount > 0 ? (
                  <div className="px-1 text-xs font-medium text-stone-700">
                    +{hiddenCount} 項
                  </div>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
