"use client";

import { CalendarLegend, EMPLOYER_CALENDAR_LEGEND } from "@/components/calendar-legend";
import { EmployerAssignForm } from "@/components/employer-assign-form";
import { WeekTimeGrid, eventPosition } from "@/components/week-time-grid";
import { availabilityWeekStart, availabilitySegments, isFullDayLeave, lessonMinutesInHongKong, overlappingLesson, shiftAvailabilityWeek } from "@/lib/calendar";
import {
  isModifiedClick,
  replaceCalendarHref,
  scrollToCalendarDay,
  useCalendarSelection,
} from "@/lib/calendar-history";
import { employerCalendarHref } from "@/lib/employer-href";
import { calendarAssignmentLabel, formatAvailabilityTime } from "@/lib/format";
import { weekGridRange } from "@/lib/week-grid";
import Link from "next/link";
import type { MouseEvent } from "react";

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

type LeaveSlot = {
  id?: string;
  leave_date: string;
  start_minute?: number | null;
  end_minute?: number | null;
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
  leaves,
  lessons,
  selectedDay,
  selectedSlot,
  view,
  nowMinute,
  onWeekNavigate,
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
  leaves: LeaveSlot[];
  lessons: WeekLesson[];
  selectedDay?: string;
  selectedSlot?: SlotSelection | null;
  view?: "month" | "week";
  nowMinute: number | null;
  onWeekNavigate?: (
    week: string,
    href: string,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void;
}) {
  const [selection, setSelection] = useCalendarSelection(
    month,
    {
      day: selectedSlot?.date ?? selectedDay ?? week,
      coachId,
      slotStart: selectedSlot?.startMinute ?? null,
      slotEnd: selectedSlot?.slotEndMinute ?? null,
    },
    false,
  );
  const liveSlot =
    selection.slotStart != null && selection.slotEnd != null
      ? {
          date: selection.day,
          startMinute: selection.slotStart,
          slotEndMinute: selection.slotEnd,
        }
      : null;
  const leaveSet = new Set(
    leaves.filter(isFullDayLeave).map((leave) => leave.leave_date),
  );
  const { start: gridStart, end: gridEnd } = weekGridRange([
    ...slots,
    ...leaves.flatMap((leave) =>
      leave.start_minute != null && leave.end_minute != null
        ? [{ start_minute: leave.start_minute, end_minute: leave.end_minute }]
        : [],
    ),
    ...lessons.map((lesson) => {
      const range = lessonMinutesInHongKong(lesson.starts_at, lesson.ends_at);
      return {
        start_minute: range.startMinute,
        end_minute: range.endMinute,
      };
    }),
  ]);
  const byDate = new Map<string, AvailabilitySlot[]>();
  for (const slot of slots) {
    const list = byDate.get(slot.available_date) ?? [];
    list.push(slot);
    byDate.set(slot.available_date, list);
  }

  const openSlot =
    liveSlot != null &&
    slots.some(
      (slot) =>
        slot.available_date === liveSlot.date &&
        slot.start_minute <= liveSlot.startMinute &&
        slot.end_minute >= liveSlot.slotEndMinute &&
        !overlappingLesson(
          liveSlot.date,
          liveSlot.startMinute,
          liveSlot.slotEndMinute,
          lessons,
        ),
    );

  function selectSlot(
    event: MouseEvent<HTMLAnchorElement>,
    date: string,
    start: number,
    end: number,
  ) {
    if (isModifiedClick(event)) {
      return;
    }
    event.preventDefault();
    setSelection({
      day: date,
      coachId,
      slotStart: start,
      slotEnd: end,
    });
    replaceCalendarHref(
      `${employerCalendarHref({
        month,
        day: date,
        coach: coachId,
        week: availabilityWeekStart(date),
        slotStart: start,
        slotEnd: end,
        view,
      })}#day`,
    );
    scrollToCalendarDay();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={prevWeekHref}
          className="text-sm text-stone-600 underline"
          onClick={(event) =>
            onWeekNavigate?.(
              shiftAvailabilityWeek(week, -1),
              prevWeekHref,
              event,
            )
          }
        >
          上週
        </Link>
        <p className="min-w-0 flex-1 text-center text-sm font-medium">
          {coachName} · {week} – {weekEnd}
        </p>
        <Link
          href={nextWeekHref}
          className="text-sm text-stone-600 underline"
          onClick={(event) =>
            onWeekNavigate?.(
              shiftAvailabilityWeek(week, 1),
              nextWeekHref,
              event,
            )
          }
        >
          下週
        </Link>
      </div>
      {!isCurrentWeek ? (
        <Link
          href={currentWeekHref}
          className="text-sm text-stone-600 underline"
          onClick={(event) =>
            onWeekNavigate?.(
              availabilityWeekStart(),
              currentWeekHref,
              event,
            )
          }
        >
          返回本週
        </Link>
      ) : null}
      <p className="text-sm text-stone-500">
        點選可返工色塊即可派更。放假或 Short Break 以紅色顯示。
      </p>
      <CalendarLegend items={EMPLOYER_CALENDAR_LEGEND} />
      <WeekTimeGrid
        days={days}
        today={today}
        selectedDay={selection.day}
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
          const breakBlocks = leaves
            .filter(
              (leave) =>
                leave.leave_date === date && !isFullDayLeave(leave),
            )
            .map((leave) => {
              const start = leave.start_minute ?? 0;
              const end = leave.end_minute ?? 0;
              const { top, height } = eventPosition(
                start,
                end,
                gridStart,
                gridEnd,
              );
              const label = `${formatAvailabilityTime(start)}–${formatAvailabilityTime(end)}`;
              return (
                <div
                  key={leave.id ?? `${date}-${start}`}
                  title={`${label} Short Break`}
                  className="absolute right-0.5 left-0.5 z-[1] overflow-hidden rounded-sm border border-rose-300 bg-rose-100 px-1 py-0.5 text-left text-xs font-medium text-rose-950"
                  style={{ top, height }}
                >
                  <span className="tabular-nums">{label}</span>
                  <span className="mt-0.5 block truncate">Short Break</span>
                </div>
              );
            });
          const availabilityBlocks = (byDate.get(date) ?? []).flatMap((slot) =>
            availabilitySegments(
              date,
              slot.start_minute,
              slot.end_minute,
              lessons,
            ).map((segment) => {
            const pending = segment.lesson?.status === "assigned";
            const confirmed = segment.lesson?.status === "completed";
            const selected =
              liveSlot?.date === date &&
              liveSlot.startMinute === segment.startMinute &&
              liveSlot.slotEndMinute === segment.endMinute;
            const { top, height } = eventPosition(
              segment.startMinute,
              segment.endMinute,
              gridStart,
              gridEnd,
            );
            const label = `${formatAvailabilityTime(segment.startMinute)}–${formatAvailabilityTime(segment.endMinute)}`;
            const className = selected
              ? "border-stone-900 bg-stone-900 text-white"
              : pending
                ? "border-dashed border-amber-400 bg-amber-100 text-amber-950"
                : confirmed
                  ? "border-emerald-400 bg-emerald-100 text-emerald-950"
                  : "border-sky-300 bg-sky-100 text-sky-950 hover:bg-sky-200";
            const key = `${slot.id}-${segment.startMinute}-${segment.endMinute}`;
            if (pending || confirmed) {
              return (
                <div
                  key={key}
                  title={`${label} ${pending ? calendarAssignmentLabel("assigned") : calendarAssignmentLabel("completed")}`}
                  className={`absolute right-0.5 left-0.5 z-[1] overflow-hidden rounded-sm border px-1 py-0.5 text-left text-xs font-medium ${className}`}
                  style={{ top, height }}
                >
                  <span className="tabular-nums">{label}</span>
                  <span className="mt-0.5 block truncate">
                    {pending
                      ? calendarAssignmentLabel("assigned")
                      : calendarAssignmentLabel("completed")}
                  </span>
                </div>
              );
            }
            return (
              <Link
                key={key}
                href={`${employerCalendarHref({
                  month,
                  day: date,
                  coach: coachId,
                  week: availabilityWeekStart(date),
                  slotStart: segment.startMinute,
                  slotEnd: segment.endMinute,
                  view,
                })}#day`}
                onClick={(event) =>
                  selectSlot(event, date, segment.startMinute, segment.endMinute)
                }
                title={`${label} 可返工`}
                className={`absolute right-0.5 left-0.5 z-[1] overflow-hidden rounded-sm border px-1 py-0.5 text-left text-xs font-medium ${className}`}
                style={{ top, height }}
              >
                <span className="tabular-nums">{label}</span>
                <span className="mt-0.5 block truncate">可返工</span>
              </Link>
            );
          }),
          );
          return [...breakBlocks, ...availabilityBlocks];
        }}
      />
      {openSlot && liveSlot ? (
        <section id="day" className="scroll-mt-4">
          <EmployerAssignForm
            coachId={coachId}
            coachName={coachName}
            date={liveSlot.date}
            startMinute={liveSlot.startMinute}
            slotEndMinute={liveSlot.slotEndMinute}
            clearHref={employerCalendarHref({
              month,
              day: liveSlot.date,
              coach: coachId,
              week: availabilityWeekStart(liveSlot.date),
              view,
            })}
          />
        </section>
      ) : null}
    </div>
  );
}
