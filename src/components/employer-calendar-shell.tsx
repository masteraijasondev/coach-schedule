"use client";

import { CalendarFilterBar } from "@/components/calendar-filter";
import { CalendarViewToggle } from "@/components/calendar-view-toggle";
import { EmployerAssignWorkspace } from "@/components/employer-assign-workspace";
import { EmployerCoachPicker } from "@/components/employer-coach-picker";
import {
  EmployerMonthWorkspace,
  type EmployerMonthCoach,
  type EmployerMonthLeave,
  type EmployerMonthLesson,
  type EmployerMonthSlot,
  type EmployerMonthType,
} from "@/components/employer-month-workspace";
import { Panel } from "@/components/ui";
import {
  availabilityWeekDays,
  availabilityWeekStart,
  lessonDayKey,
  shiftAvailabilityWeek,
  type CalendarView,
} from "@/lib/calendar";
import {
  calendarHrefFromLocation,
  isModifiedClick,
  pushCalendarHref,
  readCalendarCoachId,
  readCalendarWeek,
  replaceCalendarHref,
  useCalendarView,
  useCalendarWeek,
} from "@/lib/calendar-history";
import {
  calendarFilterQuery,
  parseCalendarFilter,
  type CalendarFilter,
} from "@/lib/calendar-filter";
import { TIMEZONE } from "@/lib/constants";
import { employerCalendarHrefWithFilter } from "@/lib/employer-href";
import { formatInTimeZone } from "date-fns-tz";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

export function EmployerCalendarShell({
  initialView,
  month,
  day,
  today,
  week: initialWeek,
  gridStart,
  gridEnd,
  coachId: initialCoachId,
  slotStart,
  slotEnd,
  lessons,
  types,
  coaches,
  availabilities,
  leaves,
  remoteWeekPanel,
  initialFilter,
}: {
  initialView: CalendarView;
  month: string;
  day: string;
  today: string;
  week: string;
  gridStart: string;
  gridEnd: string;
  coachId?: string;
  slotStart: number | null;
  slotEnd: number | null;
  lessons: EmployerMonthLesson[];
  types: EmployerMonthType[];
  coaches: EmployerMonthCoach[];
  availabilities: EmployerMonthSlot[];
  leaves: EmployerMonthLeave[];
  remoteWeekPanel: ReactNode;
  initialFilter: CalendarFilter;
}) {
  const [view, setView] = useCalendarView(initialView);
  const [coachId, setCoachId] = useState(initialCoachId);
  const [week, setWeek] = useCalendarWeek(initialWeek);
  const [filter, setFilter] = useState(initialFilter);
  const visibleCoaches = coaches.filter((coach) =>
    filter.staffIds.includes(coach.id),
  );
  const selectedCoach =
    visibleCoaches.find((coach) => coach.id === coachId) ?? null;

  useEffect(() => {
    function onPop() {
      const params = new URLSearchParams(window.location.search);
      setFilter(
        parseCalendarFilter(
          { staff: params.get("staff"), status: params.get("status") },
          coaches,
        ),
      );
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [coaches]);

  function href(params: Parameters<typeof employerCalendarHrefWithFilter>[0]) {
    return employerCalendarHrefWithFilter(params, filter, coaches);
  }

  function changeFilter(next: CalendarFilter) {
    setFilter(next);
    const query = calendarFilterQuery(next, coaches);
    replaceCalendarHref(
      calendarHrefFromLocation({
        staff: query.staff ?? "",
        status: query.status ?? "",
      }),
    );
  }
  const days = availabilityWeekDays(week);
  const weekEnd = days[6];
  const weekInGrid = days.every(
    (date) => date >= gridStart && date <= gridEnd,
  );
  const currentWeek = availabilityWeekStart();
  const nowMinute =
    Number(formatInTimeZone(new Date(), TIMEZONE, "H")) * 60 +
    Number(formatInTimeZone(new Date(), TIMEZONE, "m"));
  const assignSlots = selectedCoach
    ? availabilities.filter(
        (slot) =>
          slot.coach_id === selectedCoach.id &&
          slot.available_date >= week &&
          slot.available_date <= weekEnd,
      )
    : [];
  const assignLeaves = selectedCoach
    ? leaves.filter(
        (leave) =>
          leave.coach_id === selectedCoach.id &&
          leave.leave_date >= week &&
          leave.leave_date <= weekEnd,
      )
    : [];
  const weekDays = new Set(days);
  const weekLessons = selectedCoach
    ? lessons
        .filter(
          (lesson) =>
            lesson.coach_id === selectedCoach.id &&
            weekDays.has(lessonDayKey(lesson.starts_at)),
        )
        .map((lesson) => ({
          id: lesson.id,
          starts_at: lesson.starts_at,
          ends_at: lesson.ends_at,
          status: lesson.status,
        }))
    : [];
  const initialSelection =
    selectedCoach && slotStart != null && slotEnd != null
      ? { date: day, startMinute: slotStart, slotEndMinute: slotEnd }
      : null;

  function syncFromLocation(nextView: CalendarView) {
    setView(nextView);
    setCoachId(readCalendarCoachId());
    setWeek(readCalendarWeek(day));
  }

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
        <h1 className="text-base font-semibold">全體員工日曆</h1>
        <CalendarViewToggle
          view={view}
          monthHref={href({
            month,
            day,
            coach: selectedCoach?.id,
            week,
          })}
          weekHref={href({
            month,
            day,
            coach: selectedCoach?.id,
            week: availabilityWeekStart(day),
            view: "week",
          })}
          onViewChange={syncFromLocation}
        />
      </div>

      <CalendarFilterBar
        staff={coaches}
        filter={filter}
        onChange={changeFilter}
      />

      <div hidden={view !== "month"}>
        <EmployerMonthWorkspace
          key={month}
          month={month}
          day={day}
          today={today}
          week={week}
          coachId={selectedCoach?.id}
          slotStart={slotStart}
          slotEnd={slotEnd}
          lessons={lessons}
          types={types}
          coaches={coaches}
          availabilities={availabilities}
          leaves={leaves}
          filter={filter}
        />
      </div>

      <div hidden={view !== "week"} className="space-y-6">
        <Panel title="週曆">
          <p className="mb-3 text-sm text-stone-500">
            選擇員工以查看本週可返工時段。點選時段即可派更。名單跟隨上方篩選。
          </p>
          {visibleCoaches.length === 0 ? (
            <p className="text-sm text-stone-500">請至少選取一名員工，方可於週曆派更。</p>
          ) : (
          <EmployerCoachPicker
            coaches={visibleCoaches}
            selectedCoachId={selectedCoach?.id}
            month={month}
            day={day}
            week={week}
            view="week"
            onCoachChange={(nextCoachId) => {
              setCoachId(nextCoachId);
              setWeek(readCalendarWeek(day));
            }}
          />
          )}
        </Panel>

        {selectedCoach && weekInGrid ? (
          <Panel title={`${selectedCoach.full_name} 本週可返工`}>
            <EmployerAssignWorkspace
              key={`${selectedCoach.id}-${week}`}
              coachId={selectedCoach.id}
              coachName={selectedCoach.full_name}
              month={month}
              week={week}
              weekEnd={weekEnd}
              days={days}
              today={today}
              selectedDay={day}
              selectedSlot={initialSelection}
              prevWeekHref={href({
                month,
                day,
                coach: selectedCoach.id,
                week: shiftAvailabilityWeek(week, -1),
                view: "week",
              })}
              nextWeekHref={href({
                month,
                day,
                coach: selectedCoach.id,
                week: shiftAvailabilityWeek(week, 1),
                view: "week",
              })}
              currentWeekHref={href({
                month,
                day,
                coach: selectedCoach.id,
                week: currentWeek,
                view: "week",
              })}
              isCurrentWeek={week === currentWeek}
              slots={assignSlots}
              leaves={assignLeaves}
              lessons={weekLessons}
              nowMinute={nowMinute}
              view="week"
              onWeekNavigate={selectWeek}
            />
          </Panel>
        ) : null}

        {selectedCoach && !weekInGrid ? remoteWeekPanel : null}
      </div>
    </div>
  );
}
