"use client";

import { CalendarLegend } from "@/components/calendar-legend";
import { isModifiedClick } from "@/lib/calendar-history";
import Link from "next/link";
import type { MouseEvent } from "react";
import {
  formatCellDay,
  getMonthCells,
  hongKongToday,
  shiftMonth,
} from "@/lib/calendar";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const MAX_VISIBLE_BARS = 2;

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
  variant?: "slot" | "leave" | "pending" | "confirmed";
};

type EventBar = {
  id: string;
  text: string;
  variant: "pending" | "confirmed" | "slot" | "leave";
  sortKey: string;
};

const VARIANT_CHIP_CLASS: Record<EventBar["variant"], string> = {
  pending: "bg-amber-100 text-amber-900",
  confirmed: "bg-emerald-100 text-emerald-900",
  slot: "bg-sky-100 text-sky-900",
  leave: "bg-rose-100 text-rose-800",
};

function variantOf(
  variant?: CalendarAvailability["variant"],
  lessonStatus?: string,
): EventBar["variant"] {
  if (
    variant === "leave" ||
    variant === "pending" ||
    variant === "confirmed"
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

function startTime(timeLabel?: string): string {
  if (!timeLabel) {
    return "";
  }
  return timeLabel.slice(0, 5);
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
  const text =
    variant === "leave"
      ? [name, "放假"].filter(Boolean).join(" ")
      : [startTime(item.timeLabel) || startTime(item.label), name]
          .filter(Boolean)
          .join(" ");
  return {
    id: item.id,
    text,
    variant,
    sortKey: variant === "leave" ? "0" : `1-${item.timeLabel ?? item.label}`,
  };
}

function barFromLesson(lesson: CalendarLesson, showNames: boolean): EventBar {
  const variant = variantOf(undefined, lesson.status);
  const name = displayName(lesson.coachName, showNames);
  return {
    id: lesson.id,
    text: [startTime(lesson.timeLabel), name].filter(Boolean).join(" "),
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={hrefForMonth(prev)}
          className="text-sm text-stone-600 underline"
        >
          上月
        </Link>
        <div className="flex items-center gap-3">
          <p className="font-semibold">{month}</p>
          <Link
            href={hrefForToday}
            onClick={(event) => handleSelectDay(event, today)}
            className={
              viewingToday
                ? "text-sm text-stone-400"
                : "text-sm text-stone-600 underline"
            }
            aria-current={viewingToday ? "date" : undefined}
          >
            今日
          </Link>
        </div>
        <Link
          href={hrefForMonth(next)}
          className="text-sm text-stone-600 underline"
        >
          下月
        </Link>
      </div>
      <CalendarLegend />
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-stone-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const day = formatCellDay(cell);
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
                "flex h-28 w-full flex-col overflow-hidden rounded-md border p-1 text-left",
                inMonth
                  ? "border-stone-200 bg-white"
                  : "border-transparent bg-stone-50 text-stone-400",
                selected ? "bg-stone-50 ring-2 ring-stone-900" : "",
              ].join(" ")}
            >
              <div className="flex justify-start">
                <span
                  className={[
                    "inline-flex h-6 w-6 items-center justify-center text-sm font-medium",
                    isToday
                      ? "rounded-full bg-stone-900 text-white"
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
                    className={`truncate rounded-sm px-1 py-0.5 text-left text-xs font-medium ${VARIANT_CHIP_CLASS[bar.variant]}`}
                  >
                    {bar.text}
                  </div>
                ))}
                {hiddenCount > 0 ? (
                  <div className="px-1 text-xs text-stone-500">
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
