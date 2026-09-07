"use client";

import { cancelLessonAction } from "@/actions/lessons";
import { EmployerAssignForm } from "@/components/employer-assign-form";
import { MonthCalendar } from "@/components/month-calendar";
import { ServerActionButton } from "@/components/server-action-button";
import { EnsureStudentDirectory } from "@/components/student-directory-provider";
import { Panel } from "@/components/ui";
import {
  availabilityWeekStart,
  lessonDayKey,
  overlappingLesson,
  payrollPeriodForDate,
} from "@/lib/calendar";
import {
  isModifiedClick,
  pushCalendarHref,
  replaceCalendarHref,
  scrollToCalendarDay,
  useCalendarSelection,
} from "@/lib/calendar-history";
import { employerCalendarHref } from "@/lib/employer-href";
import {
  formatAvailabilityTime,
  formatDateTime,
  formatLessonSizeLabel,
  formatMoneyOrPending,
  lessonStatusLabel,
  nestedStudentName,
} from "@/lib/format";
import type { LessonStatus, PayMode } from "@/lib/types";
import Link from "next/link";
import type { MouseEvent } from "react";

export type EmployerMonthLesson = {
  id: string;
  lesson_type_id: string;
  coach_id: string | null;
  starts_at: string;
  ends_at: string;
  status: LessonStatus;
  earned_amount_hkd: number | null;
  student_fee_hkd: number | null;
  headcount: number | null;
  expected_headcount: number | null;
  lesson_students:
    | { students: { name: string } | { name: string }[] | null }[]
    | null;
};

export type EmployerMonthType = {
  id: string;
  name: string;
  pay_mode: PayMode;
  default_duration_minutes: number;
};

export type EmployerMonthCoach = {
  id: string;
  full_name: string;
};

export type EmployerMonthSlot = {
  id: string;
  coach_id: string;
  available_date: string;
  start_minute: number;
  end_minute: number;
};

export type EmployerMonthLeave = {
  id: string;
  coach_id: string;
  leave_date: string;
};

export function EmployerMonthWorkspace({
  month,
  day: initialDay,
  today,
  week,
  coachId: initialCoachId,
  slotStart: initialSlotStart,
  slotEnd: initialSlotEnd,
  lessons,
  types,
  coaches,
  availabilities,
  leaves,
}: {
  month: string;
  day: string;
  today: string;
  week: string;
  coachId?: string;
  slotStart: number | null;
  slotEnd: number | null;
  lessons: EmployerMonthLesson[];
  types: EmployerMonthType[];
  coaches: EmployerMonthCoach[];
  availabilities: EmployerMonthSlot[];
  leaves: EmployerMonthLeave[];
}) {
  const [selection, setSelection] = useCalendarSelection(month, {
    day: initialDay,
    coachId: initialCoachId,
    slotStart: initialSlotStart,
    slotEnd: initialSlotEnd,
  });
  const { day, coachId: selectedCoachId, slotStart, slotEnd } = selection;

  const typeMap = new Map(types.map((type) => [type.id, type.name]));
  const payModeByType = new Map(types.map((type) => [type.id, type.pay_mode]));
  const coachMap = new Map(coaches.map((coach) => [coach.id, coach.full_name]));

  const lessonsByDay = new Map<
    string,
    { id: string; coachName: string; status?: string; timeLabel?: string }[]
  >();
  for (const lesson of lessons) {
    const key = lessonDayKey(lesson.starts_at);
    const coachName = lesson.coach_id
      ? (coachMap.get(lesson.coach_id) ?? "—")
      : "—";
    const list = lessonsByDay.get(key) ?? [];
    list.push({
      id: lesson.id,
      coachName,
      status: lesson.status,
      timeLabel: `${formatDateTime(lesson.starts_at).slice(11)}–${formatDateTime(lesson.ends_at).slice(11)}`,
    });
    lessonsByDay.set(key, list);
  }

  const leaveByCoachDate = new Set(
    leaves.map((leave) => `${leave.coach_id}:${leave.leave_date}`),
  );
  const availabilityByDay = new Map<
    string,
    {
      id: string;
      label: string;
      coachName: string;
      timeLabel?: string;
      variant?: "slot" | "leave" | "pending" | "confirmed";
    }[]
  >();
  const shiftLessons = lessons.filter(
    (lesson) => lesson.status === "assigned" || lesson.status === "completed",
  );
  for (const leave of leaves) {
    const coachName = coachMap.get(leave.coach_id) ?? "—";
    const list = availabilityByDay.get(leave.leave_date) ?? [];
    list.push({
      id: leave.id,
      label: `${coachName} 放假`,
      coachName,
      variant: "leave",
    });
    availabilityByDay.set(leave.leave_date, list);
  }
  for (const availability of availabilities) {
    if (
      leaveByCoachDate.has(
        `${availability.coach_id}:${availability.available_date}`,
      )
    ) {
      continue;
    }
    const coachName = coachMap.get(availability.coach_id) ?? "—";
    const overlap = overlappingLesson(
      availability.available_date,
      availability.start_minute,
      availability.end_minute,
      shiftLessons.filter((lesson) => lesson.coach_id === availability.coach_id),
    );
    const list = availabilityByDay.get(availability.available_date) ?? [];
    list.push({
      id: availability.id,
      label: `${coachName} ${formatAvailabilityTime(availability.start_minute)}–${formatAvailabilityTime(availability.end_minute)}`,
      coachName,
      timeLabel: formatAvailabilityTime(availability.start_minute),
      variant:
        overlap?.status === "assigned"
          ? "pending"
          : overlap?.status === "completed"
            ? "confirmed"
            : "slot",
    });
    availabilityByDay.set(availability.available_date, list);
  }

  const dayLessons = lessons.filter(
    (lesson) => lessonDayKey(lesson.starts_at) === day,
  );
  const dayAvailabilityByCoach = new Map<
    string,
    {
      coachName: string;
      slots: { id: string; start: number; end: number }[];
    }
  >();
  for (const availability of availabilities) {
    if (availability.available_date !== day) {
      continue;
    }
    if (leaveByCoachDate.has(`${availability.coach_id}:${day}`)) {
      continue;
    }
    const coachName = coachMap.get(availability.coach_id) ?? "—";
    const existing = dayAvailabilityByCoach.get(availability.coach_id);
    const group = existing ?? {
      coachName,
      slots: [] as { id: string; start: number; end: number }[],
    };
    group.slots.push({
      id: availability.id,
      start: availability.start_minute,
      end: availability.end_minute,
    });
    dayAvailabilityByCoach.set(availability.coach_id, group);
  }
  const dayAvailabilities = [...dayAvailabilityByCoach.entries()].map(
    ([coachId, group]) => ({ coachId, ...group }),
  );
  const dayLeaves = leaves
    .filter((leave) => leave.leave_date === day)
    .map((leave) => ({
      id: leave.id,
      coachId: leave.coach_id,
      coachName: coachMap.get(leave.coach_id) ?? "—",
    }));

  const selectedCoach =
    coaches.find((coach) => coach.id === selectedCoachId) ?? null;
  const initialSelection =
    selectedCoach && slotStart != null && slotEnd != null
      ? { date: day, startMinute: slotStart, slotEndMinute: slotEnd }
      : null;
  const salaryHref = (coachId: string) =>
    `/employer/salary/${coachId}?month=${payrollPeriodForDate(day)}`;

  function dayHref(target: string, coachId?: string) {
    return `${employerCalendarHref({
      month: target.slice(0, 7),
      day: target,
      coach: coachId,
      week: coachId ? availabilityWeekStart(target) : week,
    })}#day`;
  }

  function selectDay(target: string) {
    setSelection({
      day: target,
      coachId: selectedCoach?.id,
      slotStart: null,
      slotEnd: null,
    });
    pushCalendarHref(dayHref(target, selectedCoach?.id));
    scrollToCalendarDay();
  }

  function selectSlot(
    event: MouseEvent<HTMLAnchorElement>,
    coachId: string,
    start: number,
    end: number,
  ) {
    if (isModifiedClick(event)) {
      return;
    }
    event.preventDefault();
    setSelection({
      day,
      coachId,
      slotStart: start,
      slotEnd: end,
    });
    replaceCalendarHref(
      `${employerCalendarHref({
        month,
        day,
        coach: coachId,
        week: availabilityWeekStart(day),
        slotStart: start,
        slotEnd: end,
      })}#day`,
    );
    scrollToCalendarDay();
  }

  return (
    <>
      <Panel title="月曆">
        <p className="mb-3 text-sm text-stone-500">
          格內最多顯示兩項。點選日期後，全部詳情在下方。員工確認後才計入薪資。
        </p>
        <MonthCalendar
          month={month}
          selectedDay={day}
          basePath="/employer"
          lessonsByDay={lessonsByDay}
          availabilityByDay={availabilityByDay}
          showNames
          onSelectDay={selectDay}
          todayHref={`${employerCalendarHref({
            month: today.slice(0, 7),
            day: today,
            coach: selectedCoach?.id,
            week: selectedCoach ? availabilityWeekStart(today) : undefined,
          })}#day`}
          monthHref={(target) =>
            employerCalendarHref({
              month: target,
              coach: selectedCoach?.id,
              week,
            })
          }
          dayHref={(target) => dayHref(target, selectedCoach?.id)}
        />
      </Panel>

      <section id="day" className="scroll-mt-4">
        <Panel title={day}>
          <ul className="divide-y divide-stone-100">
            {dayLessons.map((lesson) => {
              const studentNames = (lesson.lesson_students ?? [])
                .map(nestedStudentName)
                .filter((name): name is string => Boolean(name));
              const sizeLabel = formatLessonSizeLabel(
                payModeByType.get(lesson.lesson_type_id),
                lesson.headcount,
                lesson.expected_headcount,
              );
              const pending = lesson.status === "assigned";
              return (
                <li key={lesson.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {typeMap.get(lesson.lesson_type_id) ?? "課堂"} ·{" "}
                        {lessonStatusLabel(lesson.status)}
                      </p>
                      <p className="text-sm tabular-nums text-stone-500">
                        {formatDateTime(lesson.starts_at)} –{" "}
                        {formatDateTime(lesson.ends_at).slice(11)}
                      </p>
                      <p className="text-sm text-stone-500">
                        教練：
                        {lesson.coach_id
                          ? (coachMap.get(lesson.coach_id) ?? "—")
                          : "—"}
                      </p>
                      {studentNames.length > 0 ? (
                        <p className="text-sm text-stone-500">
                          學生：{studentNames.join("、")}
                        </p>
                      ) : null}
                      {sizeLabel ? (
                        <p className="text-sm text-stone-500">{sizeLabel}</p>
                      ) : null}
                      <p
                        className={
                          pending
                            ? "text-sm text-amber-700"
                            : "text-sm text-emerald-700"
                        }
                      >
                        {pending
                          ? "待員工確認後才計薪"
                          : `教練薪資：${formatMoneyOrPending(lesson.earned_amount_hkd)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {lesson.coach_id && !pending ? (
                        <Link
                          href={salaryHref(lesson.coach_id)}
                          className="inline-flex min-h-11 items-center rounded-md border border-stone-300 px-3 py-1.5 text-sm"
                        >
                          改價錢
                        </Link>
                      ) : null}
                      {lesson.status !== "cancelled" ? (
                        <ServerActionButton
                          action={cancelLessonAction.bind(null, lesson.id)}
                          confirmMessage="確定取消此課堂？將不再計入薪資。"
                          className="min-h-11 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:opacity-60"
                        >
                          取消
                        </ServerActionButton>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
            {dayLessons.length === 0 ? (
              <li className="py-3 text-sm text-stone-500">這天尚未有課堂</li>
            ) : null}
          </ul>

          <div className="mt-4 border-t border-stone-100 pt-4">
            <p className="mb-3 text-sm text-stone-500">
              當日可返工／放假時段；點選可返工即可派更。
            </p>
            <ul className="divide-y divide-stone-100">
              {dayLeaves.map((leave) => (
                <li key={leave.id} className="py-3">
                  <p className="font-medium">{leave.coachName}</p>
                  <p className="mt-1 text-sm text-rose-800">全日放假</p>
                </li>
              ))}
              {dayAvailabilities.map((group) => {
                const coachDayLessons = dayLessons.filter(
                  (lesson) => lesson.coach_id === group.coachId,
                );
                const selectedSlotOpen =
                  initialSelection != null &&
                  selectedCoach?.id === group.coachId &&
                  group.slots.some(
                    (slot) =>
                      slot.start === initialSelection.startMinute &&
                      slot.end === initialSelection.slotEndMinute &&
                      !overlappingLesson(
                        day,
                        slot.start,
                        slot.end,
                        coachDayLessons,
                      ),
                  );
                return (
                  <li key={group.coachId} className="space-y-3 py-3">
                    <p className="font-medium">{group.coachName}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.slots.map((slot) => {
                        const overlap = overlappingLesson(
                          day,
                          slot.start,
                          slot.end,
                          coachDayLessons,
                        );
                        const selected =
                          selectedCoach?.id === group.coachId &&
                          slotStart === slot.start &&
                          slotEnd === slot.end;
                        if (overlap) {
                          const pending = overlap.status === "assigned";
                          const studentNames = (overlap.lesson_students ?? [])
                            .map(nestedStudentName)
                            .filter((name): name is string => Boolean(name));
                          return (
                            <span
                              key={slot.id}
                              className={`rounded-md px-2 py-2 text-sm ${
                                pending
                                  ? "bg-amber-100 text-amber-950"
                                  : "bg-emerald-100 text-emerald-950"
                              }`}
                            >
                              <span className="tabular-nums">
                                {formatAvailabilityTime(slot.start)}–
                                {formatAvailabilityTime(slot.end)}
                              </span>{" "}
                              {pending ? "待確認" : "已確認"}
                              {typeMap.get(overlap.lesson_type_id)
                                ? ` ·${typeMap.get(overlap.lesson_type_id)}`
                                : ""}
                              {studentNames.length > 0
                                ? ` ·${studentNames.join("、")}`
                                : ""}
                            </span>
                          );
                        }
                        return (
                          <a
                            key={slot.id}
                            href={`${employerCalendarHref({
                              month,
                              day,
                              coach: group.coachId,
                              week: availabilityWeekStart(day),
                              slotStart: slot.start,
                              slotEnd: slot.end,
                            })}#day`}
                            onClick={(event) =>
                              selectSlot(
                                event,
                                group.coachId,
                                slot.start,
                                slot.end,
                              )
                            }
                            className={`min-h-11 rounded-md border border-dashed px-2 py-2 text-sm tabular-nums ${
                              selected
                                ? "border-stone-900 bg-stone-900 text-white"
                                : "border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100"
                            }`}
                          >
                            {formatAvailabilityTime(slot.start)}–
                            {formatAvailabilityTime(slot.end)} 可返工
                          </a>
                        );
                      })}
                    </div>
                    {selectedSlotOpen && initialSelection ? (
                      <>
                        <EnsureStudentDirectory />
                        <EmployerAssignForm
                          coachId={group.coachId}
                          coachName={group.coachName}
                          types={types}
                          date={initialSelection.date}
                          startMinute={initialSelection.startMinute}
                          slotEndMinute={initialSelection.slotEndMinute}
                          clearHref={employerCalendarHref({
                            month,
                            day,
                            coach: group.coachId,
                            week: availabilityWeekStart(day),
                          })}
                        />
                      </>
                    ) : null}
                  </li>
                );
              })}
              {dayLeaves.length === 0 && dayAvailabilities.length === 0 ? (
                <li className="py-3 text-sm text-stone-500">
                  這天尚未有人報可返工或放假
                </li>
              ) : null}
            </ul>
          </div>
        </Panel>
      </section>
    </>
  );
}
