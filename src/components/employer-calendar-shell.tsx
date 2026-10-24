"use client";

import { CalendarFilterBar } from "@/components/calendar-filter";
import { DataValue, EmphasizedText } from "@/components/data-value";
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
  isFullDayLeave,
  lessonDayKey,
  lessonMinutesInHongKong,
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
import type { PayShift } from "@/lib/expected-pay";
import { formatAvailabilityTime } from "@/lib/format";
import { TIMEZONE } from "@/lib/constants";
import { employerCalendarHrefWithFilter } from "@/lib/employer-href";
import { formatInTimeZone } from "date-fns-tz";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && startB < endA;
}

function TodayRoster({
  today,
  coaches,
  lessons,
  availabilities,
  leaves,
  filter,
}: {
  today: string;
  coaches: EmployerMonthCoach[];
  lessons: EmployerMonthLesson[];
  availabilities: EmployerMonthSlot[];
  leaves: EmployerMonthLeave[];
  filter: CalendarFilter;
}) {
  const ids = new Set(filter.staffIds);
  const nameOf = (id: string) =>
    coaches.find((coach) => coach.id === id)?.full_name ?? "員工";
  const show = (status: CalendarFilter["statuses"][number]) =>
    filter.statuses.includes(status);

  const open = show("available")
    ? availabilities.flatMap((slot) => {
        if (
          slot.available_date !== today ||
          slot.released ||
          !ids.has(slot.coach_id)
        ) {
          return [];
        }
        const covered = lessons.some((lesson) => {
          if (
            lesson.coach_id !== slot.coach_id ||
            lessonDayKey(lesson.starts_at) !== today
          ) {
            return false;
          }
          if (lesson.status !== "assigned" && lesson.status !== "completed") {
            return false;
          }
          const window = lessonMinutesInHongKong(lesson.starts_at, lesson.ends_at);
          return rangesOverlap(
            slot.start_minute,
            slot.end_minute,
            window.startMinute,
            window.endMinute,
          );
        });
        if (covered) {
          return [];
        }
        return [
          `${nameOf(slot.coach_id)} ${formatAvailabilityTime(slot.start_minute)}–${formatAvailabilityTime(slot.end_minute)}`,
        ];
      })
    : [];

  const waiting = show("assigned")
    ? lessons.flatMap((lesson) => {
        if (
          !lesson.coach_id ||
          lesson.status !== "assigned" ||
          lessonDayKey(lesson.starts_at) !== today ||
          !ids.has(lesson.coach_id)
        ) {
          return [];
        }
        const window = lessonMinutesInHongKong(lesson.starts_at, lesson.ends_at);
        return [
          `${nameOf(lesson.coach_id)} ${formatAvailabilityTime(window.startMinute)}–${formatAvailabilityTime(window.endMinute)}`,
        ];
      })
    : [];

  const off = show("leave")
    ? leaves.flatMap((leave) => {
        if (leave.leave_date !== today || !ids.has(leave.coach_id)) {
          return [];
        }
        const sick = leave.kind === "sick";
        const label = isFullDayLeave(leave)
          ? sick
            ? "全日病假"
            : "放假"
          : sick
            ? "病假"
            : "小休";
        return [`${nameOf(leave.coach_id)} ${label}`];
      })
    : [];

  return (
    <section aria-label="今日" className="rounded-2xl border border-stone-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-[#525252]">
        今日 <DataValue figure>{today}</DataValue>
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <RosterChunk title="待派更" items={open} />
        <RosterChunk title="已派更，待簽到" items={waiting} />
        <RosterChunk title="放假 / 病假" items={off} />
      </div>
    </section>
  );
}

function RosterChunk({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[#2C2C2C]">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-[#525252]">沒有</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm text-[#2C2C2C]">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>
              <EmphasizedText text={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  workTypes,
  remoteWeekPanel,
  payShifts,
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
  workTypes: {
    coachId: string;
    id: string;
    name: string;
    registersStudent: boolean;
    payMode?: string;
  }[];
  remoteWeekPanel: ReactNode;
  payShifts: PayShift[];
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
  const typeNameById = new Map(types.map((type) => [type.id, type.name]));
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
          lesson_type_name: typeNameById.get(lesson.lesson_type_id),
          student_names: lesson.student_names,
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
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-[#2C2C2C]">全體員工日曆</h1>
          <p className="mt-1 text-sm text-[#525252]">
            今日的待派更、待簽到同放假。點選日期查看或派更。
          </p>
        </div>
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
          tour="employer-view"
        />
      </div>

      <TodayRoster
        today={today}
        coaches={coaches}
        lessons={lessons}
        availabilities={availabilities}
        leaves={leaves}
        filter={filter}
      />

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
          workTypes={workTypes}
          payShifts={payShifts}
          filter={filter}
        />
      </div>

      <div hidden={view !== "week"} className="space-y-6">
        <Panel title="週曆">
          <p className="mb-3 text-sm text-slate-700">
            選擇員工以查看本週可返工時段。點選時段即可派更。名單跟隨上方篩選。
          </p>
          {visibleCoaches.length === 0 ? (
            <p className="text-sm text-slate-700">請至少選取一名員工，方可於週曆派更。</p>
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
              hourlyRate={selectedCoach.hourly_rate_hkd}
              payShifts={payShifts.filter(
                (shift) => shift.coachId === selectedCoach.id,
              )}
              onWeekNavigate={selectWeek}
            />
          </Panel>
        ) : null}

        {selectedCoach && !weekInGrid ? remoteWeekPanel : null}
      </div>
    </div>
  );
}
