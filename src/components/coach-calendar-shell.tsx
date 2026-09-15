"use client";

import { CalendarViewToggle } from "@/components/calendar-view-toggle";
import {
  CoachMonthWorkspace,
  type CoachMonthLeave,
  type CoachMonthLesson,
  type CoachMonthSlot,
} from "@/components/coach-month-workspace";
import { CoachWeekCalendar } from "@/components/coach-week-calendar";
import {
  availabilityWeekDays,
  availabilityWeekStart,
  lessonDayKey,
  type CalendarView,
} from "@/lib/calendar";
import { readCalendarWeek, useCalendarView } from "@/lib/calendar-history";
import { coachCalendarHref } from "@/lib/coach-href";
import { useState, type ReactNode } from "react";

export function CoachCalendarShell({
  initialView,
  month,
  day,
  today,
  week: initialWeek,
  gridStart,
  gridEnd,
  coachName,
  lessons,
  availabilities,
  leaves,
  remoteWeekCalendar,
}: {
  initialView: CalendarView;
  month: string;
  day: string;
  today: string;
  week: string;
  gridStart: string;
  gridEnd: string;
  coachName: string;
  lessons: CoachMonthLesson[];
  availabilities: CoachMonthSlot[];
  leaves: CoachMonthLeave[];
  remoteWeekCalendar: ReactNode;
}) {
  const [view, setView] = useCalendarView(initialView);
  const [week, setWeek] = useState(initialWeek);
  const days = availabilityWeekDays(week);
  const weekEnd = days[6];
  const weekInGrid = days.every(
    (date) => date >= gridStart && date <= gridEnd,
  );
  const weekDays = new Set(days);
  const weekSlots = availabilities.filter(
    (slot) => slot.available_date >= week && slot.available_date <= weekEnd,
  );
  const weekLeaves = leaves.filter(
    (leave) => leave.leave_date >= week && leave.leave_date <= weekEnd,
  );
  const weekLessons = lessons.filter((lesson) =>
    weekDays.has(lessonDayKey(lesson.starts_at)),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-semibold">我的工作日曆</h1>
        <CalendarViewToggle
          view={view}
          monthHref={coachCalendarHref({ month, day, week })}
          weekHref={coachCalendarHref({
            month,
            day,
            week: availabilityWeekStart(day),
            view: "week",
          })}
          onViewChange={(next) => {
            setView(next);
            setWeek(readCalendarWeek(day));
          }}
        />
      </div>

      <div hidden={view !== "month"}>
        <CoachMonthWorkspace
          key={month}
          month={month}
          day={day}
          today={today}
          coachName={coachName}
          lessons={lessons}
          availabilities={availabilities}
          leaves={leaves}
        />
      </div>

      <div hidden={view !== "week"}>
        {weekInGrid ? (
          <section id="availability" className="scroll-mt-4">
            <CoachWeekCalendar
              week={week}
              month={month}
              day={day}
              view="week"
              availabilities={weekSlots}
              leaves={weekLeaves}
              lessons={weekLessons}
            />
          </section>
        ) : (
          remoteWeekCalendar
        )}
      </div>
    </div>
  );
}
