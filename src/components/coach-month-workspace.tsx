"use client";

import { CoachDayPanel, type StaffWorkTypeOption } from "@/components/coach-day-panel";
import { MonthCalendar } from "@/components/month-calendar";
import { Panel } from "@/components/ui";
import {
  availabilitySegments,
  availabilityWeekStart,
  isFullDayLeave,
  lessonDayKey,
} from "@/lib/calendar";
import {
  pushCalendarHref,
  scrollToCalendarDay,
  useCalendarSelection,
} from "@/lib/calendar-history";
import { coachCalendarHref } from "@/lib/coach-href";
import { TIMEZONE } from "@/lib/constants";
import { formatAvailabilityTime, leaveWindowLabel } from "@/lib/format";
import type { LessonStatus } from "@/lib/types";
import { formatInTimeZone } from "date-fns-tz";

export type CoachMonthLesson = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: LessonStatus;
  lesson_type_id?: string;
  student_id?: string;
};

export type CoachMonthSlot = {
  id: string;
  coach_id: string;
  available_date: string;
  start_minute: number;
  end_minute: number;
  released?: boolean;
};

export type CoachMonthLeave = {
  id: string;
  coach_id: string;
  leave_date: string;
  start_minute?: number | null;
  end_minute?: number | null;
};

export function CoachMonthWorkspace({
  month,
  day: initialDay,
  today,
  coachName,
  lessons,
  availabilities,
  leaves,
  workTypes,
  staffKind,
  students,
}: {
  month: string;
  day: string;
  today: string;
  coachName: string;
  lessons: CoachMonthLesson[];
  availabilities: CoachMonthSlot[];
  leaves: CoachMonthLeave[];
  workTypes: StaffWorkTypeOption[];
  staffKind: "coach" | "operations";
  students: { id: string; name: string }[];
}) {
  const [selection, setSelection] = useCalendarSelection(month, {
    day: initialDay,
    slotStart: null,
    slotEnd: null,
  });
  const day = selection.day;

  const lessonsByDay = new Map<
    string,
    { id: string; coachName: string; status?: string; timeLabel?: string }[]
  >();
  for (const lesson of lessons) {
    const key = lessonDayKey(lesson.starts_at);
    const list = lessonsByDay.get(key) ?? [];
    list.push({
      id: lesson.id,
      coachName: "課堂",
      status: lesson.status,
      timeLabel: `${formatInTimeZone(lesson.starts_at, TIMEZONE, "HH:mm")}–${formatInTimeZone(lesson.ends_at, TIMEZONE, "HH:mm")}`,
    });
    lessonsByDay.set(key, list);
  }

  const leaveDates = new Set(
    leaves.filter(isFullDayLeave).map((leave) => leave.leave_date),
  );
  const shiftLessons = lessons.filter(
    (lesson) => lesson.status === "assigned" || lesson.status === "completed",
  );
  const availabilityByDay = new Map<
    string,
    {
      id: string;
      label: string;
      coachName: string;
      timeLabel?: string;
      variant?: "slot" | "leave" | "pending" | "confirmed" | "released";
    }[]
  >();
  for (const leave of leaves) {
    const list = availabilityByDay.get(leave.leave_date) ?? [];
    list.push({
      id: leave.id,
      label: leaveWindowLabel(leave),
      coachName,
      timeLabel: isFullDayLeave(leave)
        ? undefined
        : `${formatAvailabilityTime(leave.start_minute ?? 0)}–${formatAvailabilityTime(leave.end_minute ?? 0)}`,
      variant: "leave",
    });
    availabilityByDay.set(leave.leave_date, list);
  }
  for (const availability of availabilities) {
    if (leaveDates.has(availability.available_date)) {
      continue;
    }
    const list = availabilityByDay.get(availability.available_date) ?? [];
    if (availability.released) {
      list.push({
        id: availability.id,
        label: `${formatAvailabilityTime(availability.start_minute)}–${formatAvailabilityTime(availability.end_minute)}`,
        coachName,
        timeLabel: `${formatAvailabilityTime(availability.start_minute)}–${formatAvailabilityTime(availability.end_minute)}`,
        variant: "released",
      });
      availabilityByDay.set(availability.available_date, list);
      continue;
    }
    for (const segment of availabilitySegments(
      availability.available_date,
      availability.start_minute,
      availability.end_minute,
      shiftLessons,
    )) {
      const pending = segment.lesson?.status === "assigned";
      const confirmed = segment.lesson?.status === "completed";
      list.push({
        id: `${availability.id}-${segment.startMinute}-${segment.endMinute}`,
        label: `${formatAvailabilityTime(segment.startMinute)}–${formatAvailabilityTime(segment.endMinute)}`,
        coachName,
        timeLabel: `${formatAvailabilityTime(segment.startMinute)}–${formatAvailabilityTime(segment.endMinute)}`,
        variant: pending ? "pending" : confirmed ? "confirmed" : "slot",
      });
    }
    availabilityByDay.set(availability.available_date, list);
  }

  function selectDay(target: string) {
    setSelection({
      day: target,
      slotStart: null,
      slotEnd: null,
    });
    pushCalendarHref(
      coachCalendarHref({
        month: target.slice(0, 7),
        day: target,
        week: availabilityWeekStart(target),
        hash: "day",
      }),
    );
    scrollToCalendarDay();
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel title="月曆">
        <p className="mb-3 text-sm text-stone-500">
          格內最多顯示兩項。點選日期後，當日詳情、申報與簽到顯示於右側。
        </p>
        <MonthCalendar
          month={month}
          selectedDay={day}
          basePath="/coach"
          lessonsByDay={lessonsByDay}
          availabilityByDay={availabilityByDay}
          onSelectDay={selectDay}
          todayHref={coachCalendarHref({
            month: today.slice(0, 7),
            day: today,
            week: availabilityWeekStart(today),
            hash: "day",
          })}
          dayHref={(target) =>
            coachCalendarHref({
              month: target.slice(0, 7),
              day: target,
              week: availabilityWeekStart(target),
              hash: "day",
            })
          }
          monthHref={(target) => coachCalendarHref({ month: target })}
        />
      </Panel>
      <div id="day" className="min-w-0 scroll-mt-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto">
        <CoachDayPanel
          day={day}
          today={today}
          lessons={lessons}
          availabilities={availabilities}
          leaves={leaves}
          workTypes={workTypes}
          staffKind={staffKind}
          students={students}
        />
      </div>
    </div>
  );
}
