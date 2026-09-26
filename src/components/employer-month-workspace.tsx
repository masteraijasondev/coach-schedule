"use client";

import { restoreReleasedAvailabilityAction } from "@/actions/availability";
import {
  cancelLessonAction,
  employerEditCheckInAction,
  markAssignmentSickLeaveAction,
} from "@/actions/lessons";
import { LessonCheckInForm } from "@/components/lesson-check-in-form";
import { EmployerAssignForm } from "@/components/employer-assign-form";
import { EMPLOYER_CALENDAR_LEGEND } from "@/components/calendar-legend";
import { MonthCalendar } from "@/components/month-calendar";
import { ServerActionButton } from "@/components/server-action-button";
import { StaffShiftChip } from "@/components/staff-shift-composer";
import { Panel } from "@/components/ui";
import {
  availabilityWeekStart,
  availabilitySegments,
  isFullDayLeave,
  lessonDayKey,
  lessonMinutesInHongKong,
} from "@/lib/calendar";
import {
  pushCalendarHref,
  scrollToCalendarDay,
  useCalendarSelection,
} from "@/lib/calendar-history";
import {
  lessonStatusVisible,
  variantVisible,
  type CalendarFilter,
  type StaffKind,
} from "@/lib/calendar-filter";
import { employerCalendarHref, employerCalendarHrefWithFilter } from "@/lib/employer-href";
import {
  calendarAssignmentLabel,
  calendarSlotLabel,
  formatAvailabilityTime,
  formatDateTime,
  leaveWindowLabel,
} from "@/lib/format";
import type { LessonStatus, PayMode } from "@/lib/types";
import type { ReactNode } from "react";

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
  student_names: string[];
  student_id?: string;
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
  staff_kind: StaffKind;
};

export type EmployerMonthSlot = {
  id: string;
  coach_id: string;
  available_date: string;
  start_minute: number;
  end_minute: number;
  released?: boolean;
};

export type EmployerMonthLeave = {
  id: string;
  coach_id: string;
  leave_date: string;
  start_minute?: number | null;
  end_minute?: number | null;
  kind?: string | null;
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
  workTypes,
  filter,
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
  workTypes: { coachId: string; id: string; name: string }[];
  filter: CalendarFilter;
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
  const visibleStaff = new Set(filter.staffIds);

  function calendarHref(
    params: Parameters<typeof employerCalendarHref>[0],
  ) {
    return employerCalendarHrefWithFilter(params, filter, coaches);
  }

  const lessonsByDay = new Map<
    string,
    { id: string; coachName: string; status?: string; timeLabel?: string }[]
  >();
  for (const lesson of lessons) {
    if (
      !lesson.coach_id ||
      !visibleStaff.has(lesson.coach_id) ||
      !lessonStatusVisible(lesson.status, filter.statuses)
    ) {
      continue;
    }
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
    leaves
      .filter(isFullDayLeave)
      .map((leave) => `${leave.coach_id}:${leave.leave_date}`),
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
  const shiftLessons = lessons.filter(
    (lesson) => lesson.status === "assigned" || lesson.status === "completed",
  );
  for (const leave of leaves) {
    if (
      !visibleStaff.has(leave.coach_id) ||
      !variantVisible("leave", filter.statuses)
    ) {
      continue;
    }
    const coachName = coachMap.get(leave.coach_id) ?? "—";
    const list = availabilityByDay.get(leave.leave_date) ?? [];
    list.push({
      id: leave.id,
      label: `${coachName} ${leave.kind === "sick" ? "病假" : leaveWindowLabel(leave)}`,
      coachName,
      timeLabel: isFullDayLeave(leave)
        ? undefined
        : `${formatAvailabilityTime(leave.start_minute ?? 0)}–${formatAvailabilityTime(leave.end_minute ?? 0)}`,
      variant: "leave",
    });
    availabilityByDay.set(leave.leave_date, list);
  }
  for (const availability of availabilities) {
    if (!visibleStaff.has(availability.coach_id)) {
      continue;
    }
    if (
      leaveByCoachDate.has(
        `${availability.coach_id}:${availability.available_date}`,
      )
    ) {
      continue;
    }
    const coachName = coachMap.get(availability.coach_id) ?? "—";
    const list = availabilityByDay.get(availability.available_date) ?? [];
    if (availability.released) {
      if (!variantVisible("released", filter.statuses)) {
        continue;
      }
      list.push({
        id: availability.id,
        label: `${coachName} ${formatAvailabilityTime(availability.start_minute)}–${formatAvailabilityTime(availability.end_minute)}`,
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
      shiftLessons.filter((lesson) => lesson.coach_id === availability.coach_id),
    )) {
      const variant =
        segment.lesson?.status === "assigned"
          ? "pending"
          : segment.lesson?.status === "completed"
            ? "confirmed"
            : "slot";
      if (!variantVisible(variant, filter.statuses)) {
        continue;
      }
      list.push({
        id: `${availability.id}-${segment.startMinute}-${segment.endMinute}`,
        label: `${coachName} ${formatAvailabilityTime(segment.startMinute)}–${formatAvailabilityTime(segment.endMinute)}`,
        coachName,
        timeLabel: `${formatAvailabilityTime(segment.startMinute)}–${formatAvailabilityTime(segment.endMinute)}`,
        variant,
      });
    }
    availabilityByDay.set(availability.available_date, list);
  }

  const dayLessonsForSplit = lessons.filter(
    (lesson) => lessonDayKey(lesson.starts_at) === day,
  );
  const dayLessons = dayLessonsForSplit.filter(
    (lesson) =>
      Boolean(lesson.coach_id) &&
      visibleStaff.has(lesson.coach_id ?? "") &&
      lessonStatusVisible(lesson.status, filter.statuses),
  );
  const dayAvailabilityByCoach = new Map<
    string,
    {
      coachName: string;
      slots: { id: string; start: number; end: number; released: boolean }[];
    }
  >();
  for (const availability of availabilities) {
    if (availability.available_date !== day) {
      continue;
    }
    if (!visibleStaff.has(availability.coach_id)) {
      continue;
    }
    if (leaveByCoachDate.has(`${availability.coach_id}:${day}`)) {
      continue;
    }
    const coachName = coachMap.get(availability.coach_id) ?? "—";
    const existing = dayAvailabilityByCoach.get(availability.coach_id);
    const group = existing ?? {
      coachName,
      slots: [] as { id: string; start: number; end: number; released: boolean }[],
    };
    group.slots.push({
      id: availability.id,
      start: availability.start_minute,
      end: availability.end_minute,
      released: Boolean(availability.released),
    });
    dayAvailabilityByCoach.set(availability.coach_id, group);
  }
  const dayAvailabilities = [...dayAvailabilityByCoach.entries()].map(
    ([coachId, group]) => ({ coachId, ...group }),
  );
  const dayLeaves = leaves
    .filter(
      (leave) =>
        leave.leave_date === day &&
        visibleStaff.has(leave.coach_id) &&
        variantVisible("leave", filter.statuses),
    )
    .map((leave) => ({
      id: leave.id,
      coachId: leave.coach_id,
      coachName: coachMap.get(leave.coach_id) ?? "—",
      start_minute: leave.start_minute,
      end_minute: leave.end_minute,
      kind: leave.kind,
    }));

  const selectedCoach =
    coaches.find((coach) => coach.id === selectedCoachId) ?? null;

  function dayHref(target: string, coachId?: string) {
    return `${calendarHref({
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

  const coveredLessonIds = new Set<string>();
  type DayChip = {
    key: string;
    start: number;
    label: string;
    tone: "slot" | "pending" | "confirmed" | "leave" | "released";
    defaultOpen?: boolean;
    body?: ReactNode;
  };
  const chipsByCoach = new Map<
    string,
    { coachName: string; items: DayChip[] }
  >();

  function coachChips(coachId: string, coachName: string) {
    const existing = chipsByCoach.get(coachId);
    if (existing) {
      return existing;
    }
    const created = { coachName, items: [] as DayChip[] };
    chipsByCoach.set(coachId, created);
    return created;
  }

  function lessonBody(
    lesson: EmployerMonthLesson,
    windowStart: number,
    windowEnd: number,
  ) {
    if (lesson.status === "assigned") {
      return (
        <div className="flex flex-col gap-2">
          <ServerActionButton
            action={cancelLessonAction.bind(null, lesson.id)}
            confirmMessage="確定改回待公司派更？這段已派更會取消。"
            className="min-h-11 rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-800 disabled:opacity-60"
          >
            改回待公司派更
          </ServerActionButton>
          <ServerActionButton
            action={markAssignmentSickLeaveAction.bind(null, lesson.id)}
            confirmMessage="確定將這段派更轉為病假？"
            className="min-h-11 rounded-md border border-rose-200 px-3 py-1.5 text-sm text-rose-800 disabled:opacity-60"
          >
            轉為病假
          </ServerActionButton>
        </div>
      );
    }
    const coach = coaches.find((item) => item.id === lesson.coach_id);
    const coachWorkTypes = workTypes.filter((type) => type.coachId === lesson.coach_id);
    const lessonWindow = lessonMinutesInHongKong(lesson.starts_at, lesson.ends_at);
    return (
      <LessonCheckInForm
        lessonId={lesson.id}
        date={lessonWindow.date}
        windowStart={windowStart}
        windowEnd={windowEnd}
        initialPeriods={[
          {
            startMinute: lessonWindow.startMinute,
            endMinute: lessonWindow.endMinute,
          },
        ]}
        initialLessonTypeId={lesson.lesson_type_id}
        workTypes={coachWorkTypes}
        staffKind={coach?.staff_kind === "operations" ? "operations" : "coach"}
        action={employerEditCheckInAction}
        submitLabel="儲存修改"
      />
    );
  }

  for (const leave of dayLeaves) {
    const fullDay = isFullDayLeave(leave);
    const start = fullDay ? 0 : (leave.start_minute ?? 0);
    const end = fullDay ? 0 : (leave.end_minute ?? 0);
    coachChips(leave.coachId, leave.coachName).items.push({
      key: leave.id,
      start,
      tone: "leave",
      label: fullDay
        ? leave.kind === "sick"
          ? "全日病假"
          : "全日放假"
        : `${formatAvailabilityTime(start)}–${formatAvailabilityTime(end)} ${leave.kind === "sick" ? "病假" : "放假"}`,
    });
  }

  for (const group of dayAvailabilities) {
    const coachDayLessons = dayLessonsForSplit.filter(
      (lesson) => lesson.coach_id === group.coachId,
    );
    for (const slot of group.slots) {
      if (slot.released) {
        if (!variantVisible("released", filter.statuses)) {
          continue;
        }
        coachChips(group.coachId, group.coachName).items.push({
          key: slot.id,
          start: slot.start,
          tone: "released",
          label: `${formatAvailabilityTime(slot.start)}–${formatAvailabilityTime(slot.end)} ${calendarSlotLabel(true)}`,
          body: (
            <ServerActionButton
              action={restoreReleasedAvailabilityAction.bind(null, slot.id)}
              className="min-h-11 rounded-md border border-stone-400 px-2 py-1 text-xs text-stone-800 disabled:opacity-60"
            >
              恢復待派更
            </ServerActionButton>
          ),
        });
        continue;
      }
      const sickBlocks = dayLeaves
        .filter(
          (leave) =>
            leave.coachId === group.coachId &&
            leave.kind === "sick" &&
            !isFullDayLeave(leave),
        )
        .map((leave) => ({
          start: leave.start_minute ?? 0,
          end: leave.end_minute ?? 0,
        }));
      let openRanges = [{ start: slot.start, end: slot.end }];
      for (const block of sickBlocks) {
        openRanges = openRanges.flatMap((range) => {
          if (block.end <= range.start || block.start >= range.end) {
            return [range];
          }
          const next: { start: number; end: number }[] = [];
          if (block.start > range.start) {
            next.push({ start: range.start, end: block.start });
          }
          if (block.end < range.end) {
            next.push({ start: block.end, end: range.end });
          }
          return next;
        });
      }
      for (const range of openRanges) {
      for (const segment of availabilitySegments(
        day,
        range.start,
        range.end,
        coachDayLessons,
      )) {
        const overlap = segment.lesson;
        const variant = overlap
          ? overlap.status === "assigned"
            ? "pending"
            : "confirmed"
          : "slot";
        if (!variantVisible(variant, filter.statuses)) {
          continue;
        }
        const timeLabel = `${formatAvailabilityTime(segment.startMinute)}–${formatAvailabilityTime(segment.endMinute)}`;
        if (overlap) {
          coveredLessonIds.add(overlap.id);
          coachChips(group.coachId, group.coachName).items.push({
            key: `${slot.id}-${segment.startMinute}-${segment.endMinute}`,
            start: segment.startMinute,
            tone: variant,
            label: `${timeLabel} ${
              overlap.status === "assigned"
                ? calendarAssignmentLabel("assigned")
                : calendarAssignmentLabel("completed")
            }${typeMap.get(overlap.lesson_type_id) ? ` · ${typeMap.get(overlap.lesson_type_id)}` : ""}`,
            body: lessonBody(overlap, slot.start, slot.end),
          });
          continue;
        }
        const selected =
          selectedCoach?.id === group.coachId &&
          slotStart === segment.startMinute &&
          slotEnd === segment.endMinute;
        coachChips(group.coachId, group.coachName).items.push({
          key: `${slot.id}-${segment.startMinute}-${segment.endMinute}`,
          start: segment.startMinute,
          tone: "slot",
          defaultOpen: selected,
          label: `${timeLabel} ${calendarSlotLabel()}`,
          body: (
            <EmployerAssignForm
              coachId={group.coachId}
              coachName={group.coachName}
              date={day}
              startMinute={segment.startMinute}
              slotEndMinute={segment.endMinute}
              clearHref={calendarHref({
                month,
                day,
                coach: group.coachId,
                week: availabilityWeekStart(day),
              })}
            />
          ),
        });
      }
      }
    }
  }

  for (const lesson of dayLessons) {
    if (coveredLessonIds.has(lesson.id) || !lesson.coach_id) {
      continue;
    }
    const window = lessonMinutesInHongKong(lesson.starts_at, lesson.ends_at);
    const pending = lesson.status === "assigned";
    const coachName = coachMap.get(lesson.coach_id) ?? "—";
    coachChips(lesson.coach_id, coachName).items.push({
      key: lesson.id,
      start: window.startMinute,
      tone: pending ? "pending" : "confirmed",
      label: `${formatAvailabilityTime(window.startMinute)}–${formatAvailabilityTime(window.endMinute)} ${
        pending
          ? calendarAssignmentLabel("assigned")
          : calendarAssignmentLabel("completed")
      }`,
      body: lessonBody(lesson, window.startMinute, window.endMinute),
    });
  }

  const dayChips = [...chipsByCoach.entries()]
    .map(([coachId, group]) => {
      const items = [...group.items].sort(
        (a, b) => a.start - b.start || a.label.localeCompare(b.label, "zh-Hant"),
      );
      const leaveOnly = items.length > 0 && items.every((item) => item.tone === "leave");
      return {
        key: coachId,
        start: items[0]?.start ?? 0,
        coachName: group.coachName,
        tone: leaveOnly ? ("leave" as const) : ("staff" as const),
        defaultOpen: items.some((item) => item.defaultOpen),
        label: leaveOnly ? `${group.coachName} 放假` : group.coachName,
        items,
      };
    })
    .sort(
      (a, b) =>
        a.start - b.start || a.coachName.localeCompare(b.coachName, "zh-Hant"),
    );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Panel title="月曆">
        <p className="mb-3 text-sm text-stone-500">
          格內最多顯示五項。請使用上方篩選查看整體時段。點選日期後，當日詳情與派更顯示於右側。
        </p>
        <MonthCalendar
          month={month}
          selectedDay={day}
          basePath="/employer"
          lessonsByDay={lessonsByDay}
          availabilityByDay={availabilityByDay}
          showNames
          legendItems={EMPLOYER_CALENDAR_LEGEND}
          onSelectDay={selectDay}
          todayHref={`${calendarHref({
            month: today.slice(0, 7),
            day: today,
            coach: selectedCoach?.id,
            week: selectedCoach ? availabilityWeekStart(today) : undefined,
          })}#day`}
          monthHref={(target) =>
            calendarHref({
              month: target,
              coach: selectedCoach?.id,
              week,
            })
          }
          dayHref={(target) => dayHref(target, selectedCoach?.id)}
        />
      </Panel>

      <section
        id="day"
        className="min-w-0 scroll-mt-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto"
      >
        <Panel title={day}>
          <p className="mb-3 text-sm text-stone-500">
            當日時段按時間排列。選擇員工後即可派更或修改。
          </p>
          <div className="flex flex-col gap-2">
            {dayChips.map((chip) =>
              chip.items.length === 1 && !chip.items[0]?.body ? (
                <StaffShiftChip
                  key={chip.key}
                  label={
                    chip.items[0].label === "全日放假" ||
                    chip.items[0].label === "全日病假"
                      ? `${chip.coachName} ${chip.items[0].label}`
                      : `${chip.items[0].label} ${chip.coachName}`
                  }
                  tone={chip.items[0].tone}
                />
              ) : (
                <StaffShiftChip
                  key={chip.key}
                  label={chip.label}
                  tone={chip.tone}
                  defaultOpen={chip.defaultOpen}
                >
                  <div className="flex flex-col gap-2">
                    {chip.items.map((item) => (
                      <StaffShiftChip
                        key={item.key}
                        label={item.label}
                        tone={item.tone}
                        defaultOpen={item.defaultOpen}
                      >
                        {item.body}
                      </StaffShiftChip>
                    ))}
                  </div>
                </StaffShiftChip>
              ),
            )}
            {dayChips.length === 0 ? (
              <p className="text-sm text-stone-500">當日尚未有時段</p>
            ) : null}
          </div>
        </Panel>
      </section>
    </div>
  );
}
