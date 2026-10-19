"use client";

import { CalendarViewToggle } from "@/components/calendar-view-toggle";
import { CoachScheduleScopeToggle } from "@/components/coach-schedule-scope";
import {
  CoachMonthWorkspace,
  type CoachMonthLeave,
  type CoachMonthLesson,
  type CoachMonthSlot,
} from "@/components/coach-month-workspace";
import { CoachWeekCalendar } from "@/components/coach-week-calendar";
import { TeamWeekSchedule } from "@/components/team-schedule-list";
import {
  availabilityWeekDays,
  availabilityWeekStart,
  lessonDayKey,
  type CalendarView,
} from "@/lib/calendar";
import {
  isModifiedClick,
  pushCalendarHref,
  readCalendarWeek,
  replaceCalendarHref,
  calendarHrefFromLocation,
  useCalendarView,
  useCalendarWeek,
} from "@/lib/calendar-history";
import {
  COACH_SCHEDULE_SCOPE_EVENT,
  coachCalendarHref,
  parseCoachScheduleScope,
  type CoachScheduleScope,
} from "@/lib/coach-href";
import {
  colleagueScheduleBars,
  type ColleagueSchedule,
} from "@/lib/team-schedule";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

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
  workTypes,
  colleagues,
  lessonTypes,
  staffKind,
  scope: initialScope,
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
  workTypes: { id: string; name: string; registersStudent: boolean }[];
  colleagues: ColleagueSchedule[];
  lessonTypes: { id: string; name: string }[];
  staffKind: "coach" | "operations";
  scope: CoachScheduleScope;
  remoteWeekCalendar: ReactNode;
}) {
  const [view, setView] = useCalendarView(initialView);
  const [week, setWeek] = useCalendarWeek(initialWeek);
  const [scope, setScope] = useState(initialScope);
  const showColleagues = scope === "all";

  useEffect(() => {
    function onPop() {
      const params = new URLSearchParams(window.location.search);
      setScope(parseCoachScheduleScope(params.get("scope")));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function changeScope(next: CoachScheduleScope) {
    setScope(next);
    replaceCalendarHref(
      calendarHrefFromLocation({ scope: next === "self" ? "self" : "" }),
    );
    window.dispatchEvent(new Event(COACH_SCHEDULE_SCOPE_EVENT));
  }
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
  const colleagueBars = colleagueScheduleBars(
    colleagues,
    new Map(lessonTypes.map((type) => [type.id, type.name])),
  );

  function selectWeek(
    nextWeek: string,
    href: string,
    event: MouseEvent<HTMLAnchorElement>,
  ) {
    if (isModifiedClick(event)) {
      return;
    }
    const nextDays = availabilityWeekDays(nextWeek);
    const inGrid = nextDays.every(
      (date) => date >= gridStart && date <= gridEnd,
    );
    if (!inGrid) {
      return;
    }
    event.preventDefault();
    setWeek(nextWeek);
    pushCalendarHref(href);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-semibold">我的工作日曆</h1>
        <div className="flex flex-wrap items-center gap-2">
          <CoachScheduleScopeToggle scope={scope} onChange={changeScope} />
          <CalendarViewToggle
            view={view}
            monthHref={coachCalendarHref({ month, day, week, scope })}
            weekHref={coachCalendarHref({
              month,
              day,
              week: availabilityWeekStart(day),
              view: "week",
              scope,
            })}
            onViewChange={(next) => {
              setView(next);
              setWeek(readCalendarWeek(day));
            }}
            tour="coach-view"
          />
        </div>
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
          workTypes={workTypes}
          colleagues={showColleagues ? colleagues : []}
          lessonTypes={lessonTypes}
          staffKind={staffKind}
          scope={scope}
        />
      </div>

      <div hidden={view !== "week"} className="space-y-4">
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
              workTypes={workTypes}
              staffKind={staffKind}
              scope={scope}
              onWeekNavigate={selectWeek}
            />
          </section>
        ) : (
          remoteWeekCalendar
        )}
        {showColleagues && colleagues.length > 0 ? (
          <TeamWeekSchedule days={days} bars={colleagueBars} />
        ) : null}
      </div>
    </div>
  );
}
