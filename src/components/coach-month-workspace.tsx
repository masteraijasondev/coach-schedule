"use client";

import { CoachDayPanel, type StaffWorkTypeOption } from "@/components/coach-day-panel";
import { MonthCalendar } from "@/components/month-calendar";
import { TeamDaySchedule } from "@/components/team-schedule-list";
import { Panel } from "@/components/ui";
import {
  availabilitySegments,
  takeCompletedLessonOnce,
  availabilityWeekStart,
  isFullDayLeave,
  lessonDayKey,
  lessonMinutesInHongKong,
} from "@/lib/calendar";
import {
  pushCalendarHref,
  scrollToCalendarDay,
  useCalendarSelection,
} from "@/lib/calendar-history";
import { coachCalendarHref, type CoachScheduleScope } from "@/lib/coach-href";
import { checkedInLabel, formatAvailabilityTime, leaveWindowLabel } from "@/lib/format";
import {
  colleagueScheduleBars,
  type ColleagueSchedule,
} from "@/lib/team-schedule";
import type { LessonStatus } from "@/lib/types";

export type CoachMonthLesson = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: LessonStatus;
  lesson_type_id?: string;
  student_id?: string;
  student_names?: string[];
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
  kind?: string | null;
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
  colleagues,
  lessonTypes,
  staffKind,
  payRatio = null,
  scope,
}: {
  month: string;
  day: string;
  today: string;
  coachName: string;
  lessons: CoachMonthLesson[];
  availabilities: CoachMonthSlot[];
  leaves: CoachMonthLeave[];
  workTypes: StaffWorkTypeOption[];
  colleagues: ColleagueSchedule[];
  lessonTypes: { id: string; name: string }[];
  staffKind: "coach" | "operations";
  payRatio?: number | null;
  scope: CoachScheduleScope;
}) {
  const [selection, setSelection] = useCalendarSelection(month, {
    day: initialDay,
    slotStart: null,
    slotEnd: null,
  });
  const day = selection.day;
  const typeNameById = new Map(workTypes.map((type) => [type.id, type.name]));

  const lessonsByDay = new Map<
    string,
    { id: string; coachName: string; status?: string; timeLabel?: string }[]
  >();
  for (const lesson of lessons) {
    const key = lessonDayKey(lesson.starts_at);
    const list = lessonsByDay.get(key) ?? [];
    const lessonWindow = lessonMinutesInHongKong(lesson.starts_at, lesson.ends_at);
    const timeLabel = `${formatAvailabilityTime(lessonWindow.startMinute)}–${formatAvailabilityTime(lessonWindow.endMinute)}`;
    list.push({
      id: lesson.id,
      coachName,
      status: lesson.status,
      timeLabel:
        lesson.status === "completed"
          ? checkedInLabel({
              time: timeLabel,
              typeName: typeNameById.get(lesson.lesson_type_id ?? ""),
              studentNames: lesson.student_names,
              withStatus: false,
            })
          : timeLabel,
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
      variant?: "slot" | "leave" | "sick" | "pending" | "confirmed" | "released";
    }[]
  >();
  for (const leave of leaves) {
    const list = availabilityByDay.get(leave.leave_date) ?? [];
    list.push({
      id: leave.id,
      label: `${coachName} ${leaveWindowLabel(leave)}`,
      coachName,
      timeLabel: isFullDayLeave(leave)
        ? undefined
        : `${formatAvailabilityTime(leave.start_minute ?? 0)}–${formatAvailabilityTime(leave.end_minute ?? 0)}`,
      variant: leave.kind === "sick" ? "sick" : "leave",
    });
    availabilityByDay.set(leave.leave_date, list);
  }
  const seenCompleted = new Set<string>();
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
      if (!takeCompletedLessonOnce(segment, seenCompleted)) {
        continue;
      }
      const pending = segment.lesson?.status === "assigned";
      const confirmed = segment.lesson?.status === "completed";
      const segmentTime = `${formatAvailabilityTime(segment.startMinute)}–${formatAvailabilityTime(segment.endMinute)}`;
      const segmentLabel = confirmed
        ? checkedInLabel({
            time: segmentTime,
            typeName: typeNameById.get(segment.lesson?.lesson_type_id ?? ""),
            studentNames: segment.lesson?.student_names,
            withStatus: false,
          })
        : segmentTime;
      list.push({
        id: `${availability.id}-${segment.startMinute}-${segment.endMinute}`,
        label: segmentLabel,
        coachName,
        timeLabel: segmentLabel,
        variant: pending ? "pending" : confirmed ? "confirmed" : "slot",
      });
    }
    availabilityByDay.set(availability.available_date, list);
  }

  const colleagueBars = colleagueScheduleBars(
    colleagues,
    new Map(lessonTypes.map((type) => [type.id, type.name])),
  );
  for (const bar of colleagueBars) {
    const list = availabilityByDay.get(bar.date) ?? [];
    list.push({
      id: bar.id,
      label: bar.label,
      coachName: bar.coachName,
      timeLabel: bar.timeLabel,
      variant: bar.variant,
    });
    availabilityByDay.set(bar.date, list);
  }
  const teamDay = colleagueBars.filter((bar) => bar.date === day);

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
        scope,
        hash: "day",
      }),
    );
    scrollToCalendarDay();
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel title="月曆">
        <p className="mb-3 text-sm text-stone-500">
          {scope === "self"
            ? "月曆只顯示你的行程。格內最多顯示五項。點選日期後，右側是你的申報與簽到。"
            : "月曆列出全體同事。格內最多顯示五項。點選日期後，右側仍是你的申報與簽到。"}
        </p>
        <MonthCalendar
          month={month}
          selectedDay={day}
          basePath="/coach"
          lessonsByDay={lessonsByDay}
          availabilityByDay={availabilityByDay}
          showNames
          onSelectDay={selectDay}
          todayHref={coachCalendarHref({
            month: today.slice(0, 7),
            day: today,
            week: availabilityWeekStart(today),
            scope,
            hash: "day",
          })}
          dayHref={(target) =>
            coachCalendarHref({
              month: target.slice(0, 7),
              day: target,
              week: availabilityWeekStart(target),
              scope,
              hash: "day",
            })
          }
          monthHref={(target) => coachCalendarHref({ month: target, scope })}
          tour="coach-month"
        />
      </Panel>
      <div id="day" data-tour="coach-day" className="min-w-0 scroll-mt-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto">
        <CoachDayPanel
          day={day}
          today={today}
          lessons={lessons}
          availabilities={availabilities}
          leaves={leaves}
          workTypes={workTypes}
          staffKind={staffKind}
          payRatio={payRatio}
          teamDay={colleagues.length > 0 ? <TeamDaySchedule bars={teamDay} /> : null}
        />
      </div>
    </div>
  );
}
