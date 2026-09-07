"use client";

import { CalendarLegend } from "@/components/calendar-legend";
import { WeekTimeGrid, eventPosition } from "@/components/week-time-grid";
import { availabilityWeekStart, overlappingLesson } from "@/lib/calendar";
import { employerCalendarHref } from "@/lib/employer-href";
import { formatAvailabilityTime } from "@/lib/format";
import { weekGridRange } from "@/lib/week-grid";
import Link from "next/link";

type AvailabilitySlot = {
  id: string;
  available_date: string;
  start_minute: number;
  end_minute: number;
};

type SlotSelection = {
  date: string;
  startMinute: number;
  slotEndMinute: number;
};

type WeekLesson = {
  id: string;
  starts_at: string;
  ends_at: string;
  status?: string;
};

export function EmployerAssignWorkspace({
  coachId,
  coachName,
  month,
  week,
  weekEnd,
  days,
  today,
  prevWeekHref,
  nextWeekHref,
  currentWeekHref,
  isCurrentWeek,
  slots,
  leaveDates,
  lessons,
  selectedDay,
  selectedSlot,
  view,
  nowMinute,
}: {
  coachId: string;
  coachName: string;
  month: string;
  week: string;
  weekEnd: string;
  days: string[];
  today: string;
  prevWeekHref: string;
  nextWeekHref: string;
  currentWeekHref: string;
  isCurrentWeek: boolean;
  slots: AvailabilitySlot[];
  leaveDates: string[];
  lessons: WeekLesson[];
  selectedDay?: string;
  selectedSlot?: SlotSelection | null;
  view?: "month" | "week";
  nowMinute: number | null;
}) {
  const leaveSet = new Set(leaveDates);
  const { start: gridStart, end: gridEnd } = weekGridRange(slots);
  const byDate = new Map<string, AvailabilitySlot[]>();
  for (const slot of slots) {
    const list = byDate.get(slot.available_date) ?? [];
    list.push(slot);
    byDate.set(slot.available_date, list);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={prevWeekHref} className="text-sm text-stone-600 underline">
          上週
        </Link>
        <p className="min-w-0 flex-1 text-center text-sm font-medium">
          {coachName} · {week} – {weekEnd}
        </p>
        <Link href={nextWeekHref} className="text-sm text-stone-600 underline">
          下週
        </Link>
      </div>
      {!isCurrentWeek ? (
        <Link href={currentWeekHref} className="text-sm text-stone-600 underline">
          返回本週
        </Link>
      ) : null}
      <p className="text-sm text-stone-500">
        點選可返工色塊即可派更。放假在頂列。
      </p>
      <CalendarLegend />
      <WeekTimeGrid
        days={days}
        today={today}
        selectedDay={selectedDay}
        gridStart={gridStart}
        gridEnd={gridEnd}
        nowMinute={days.includes(today) ? nowMinute : null}
        allDay={(date) =>
          leaveSet.has(date) ? (
            <p className="rounded-sm bg-rose-100 px-1 py-1 text-center text-xs font-medium text-rose-900">
              放假
            </p>
          ) : null
        }
        events={(date) => {
          if (leaveSet.has(date)) {
            return null;
          }
          return (byDate.get(date) ?? []).map((slot) => {
            const overlap = overlappingLesson(
              date,
              slot.start_minute,
              slot.end_minute,
              lessons,
            );
            const pending = overlap?.status === "assigned";
            const confirmed = overlap?.status === "completed";
            const selected =
              selectedSlot?.date === date &&
              selectedSlot.startMinute === slot.start_minute &&
              selectedSlot.slotEndMinute === slot.end_minute;
            const { top, height } = eventPosition(
              slot.start_minute,
              slot.end_minute,
              gridStart,
              gridEnd,
            );
            const label = `${formatAvailabilityTime(slot.start_minute)}–${formatAvailabilityTime(slot.end_minute)}`;
            const className = selected
              ? "border-stone-900 bg-stone-900 text-white"
              : pending
                ? "border-dashed border-amber-400 bg-amber-100 text-amber-950"
                : confirmed
                  ? "border-emerald-400 bg-emerald-100 text-emerald-950"
                  : "border-sky-300 bg-sky-100 text-sky-950 hover:bg-sky-200";
            if (pending || confirmed) {
              return (
                <div
                  key={slot.id}
                  title={`${label} ${pending ? "待確認" : "已確認"}`}
                  className={`absolute right-0.5 left-0.5 z-[1] overflow-hidden rounded-sm border px-1 py-0.5 text-left text-xs font-medium ${className}`}
                  style={{ top, height }}
                >
                  <span className="tabular-nums">{label}</span>
                  <span className="mt-0.5 block truncate">
                    {pending ? "待確認" : "已確認"}
                  </span>
                </div>
              );
            }
            return (
              <Link
                key={slot.id}
                href={`${employerCalendarHref({
                  month,
                  day: date,
                  coach: coachId,
                  week: availabilityWeekStart(date),
                  slotStart: slot.start_minute,
                  slotEnd: slot.end_minute,
                  view,
                })}#day`}
                title={`${label} 可返工`}
                className={`absolute right-0.5 left-0.5 z-[1] overflow-hidden rounded-sm border px-1 py-0.5 text-left text-xs font-medium ${className}`}
                style={{ top, height }}
              >
                <span className="tabular-nums">{label}</span>
                <span className="mt-0.5 block truncate">可返工</span>
              </Link>
            );
          });
        }}
      />
    </div>
  );
}
