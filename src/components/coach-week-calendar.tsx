"use client";

import {
  cancelLeaveByIdAction,
  deleteAvailabilityAction,
  saveAvailabilityAction,
  saveShortBreakAction,
} from "@/actions/availability";
import { undoCheckInAction } from "@/actions/lessons";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { ServerActionButton } from "@/components/server-action-button";
import { CalendarLegend } from "@/components/calendar-legend";
import { LessonCheckInForm } from "@/components/lesson-check-in-form";
import { CancelFullDayLeaveButton } from "@/components/leave-report-form";
import { StaffShiftComposer } from "@/components/staff-shift-composer";
import { Panel, SubmitButton } from "@/components/ui";
import { WeekTimeGrid, eventPosition } from "@/components/week-time-grid";
import {
  availabilitySegments,
  availabilityWeekDays,
  availabilityWeekStart,
  dayHasLessonOnDate,
  hongKongToday,
  isFullDayLeave,
  lessonMinutesInHongKong,
  overlappingLesson,
  shiftAvailabilityWeek,
  type CalendarView,
} from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import {
  calendarAssignmentLabel,
  calendarSlotLabel,
  formatAvailabilityTime,
} from "@/lib/format";
import { weekGridRange } from "@/lib/week-grid";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { coachCalendarHref } from "@/lib/coach-href";
import Link from "next/link";
import type { MouseEvent } from "react";

const DEFAULT_START_MINUTE = 9 * 60;
const MINUTES_PER_DAY = 1440;

export type CoachWeekSlot = {
  id: string;
  coach_id: string;
  available_date: string;
  start_minute: number;
  end_minute: number;
  released?: boolean;
};

export type CoachWeekLeave = {
  id?: string;
  leave_date: string;
  kind?: string | null;
  start_minute?: number | null;
  end_minute?: number | null;
};

export type CoachWeekLesson = {
  id: string;
  starts_at: string;
  ends_at: string;
  status?: string;
  lesson_type_id?: string;
  student_id?: string;
};

export type StaffWorkTypeOption = {
  id: string;
  name: string;
};

function availabilityStartsAt(date: string, startMinute: number): Date {
  const hour = String(Math.floor(startMinute / 60)).padStart(2, "0");
  const minute = String(startMinute % 60).padStart(2, "0");
  return fromZonedTime(`${date}T${hour}:${minute}:00`, TIMEZONE);
}

function canEditAvailability(
  availability: CoachWeekSlot,
  now: Date,
  locked: boolean,
): boolean {
  if (locked) {
    return false;
  }
  return (
    availabilityStartsAt(
      availability.available_date,
      availability.start_minute,
    ) > now
  );
}

function defaultStartMinute(
  date: string,
  today: string,
  now: Date,
): number | null {
  if (date < today) {
    return null;
  }
  if (date > today) {
    return DEFAULT_START_MINUTE;
  }
  const hour = Number(formatInTimeZone(now, TIMEZONE, "H"));
  const minute = Number(formatInTimeZone(now, TIMEZONE, "m"));
  const nextSlot = (Math.floor((hour * 60 + minute) / 30) + 1) * 30;
  return nextSlot < MINUTES_PER_DAY ? nextSlot : null;
}

function coachWeekHref(
  week: string,
  month: string,
  day: string,
  view?: CalendarView,
): string {
  return coachCalendarHref({
    month,
    day,
    week,
    view,
    hash: "availability",
  });
}

export function CoachWeekCalendar({
  week,
  month,
  day,
  view,
  availabilities,
  leaves,
  lessons,
  workTypes,
  staffKind,
  loadError = false,
  onWeekNavigate,
}: {
  week: string;
  month: string;
  day: string;
  view?: CalendarView;
  availabilities: CoachWeekSlot[];
  leaves: CoachWeekLeave[];
  lessons: CoachWeekLesson[];
  workTypes: StaffWorkTypeOption[];
  staffKind: "coach" | "operations";
  loadError?: boolean;
  onWeekNavigate?: (
    week: string,
    href: string,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void;
}) {
  const currentWeek = availabilityWeekStart();
  const prevWeek = shiftAvailabilityWeek(week, -1);
  const nextWeek = shiftAvailabilityWeek(week, 1);
  const days = availabilityWeekDays(week);
  const weekEnd = days[6];
  const now = new Date();
  const today = hongKongToday();
  const assignedLessons = lessons;
  const byDate = new Map<string, CoachWeekSlot[]>();
  for (const availability of availabilities) {
    const rows = byDate.get(availability.available_date) ?? [];
    rows.push(availability);
    byDate.set(availability.available_date, rows);
  }
  const leaveDates = new Set(
    leaves.filter(isFullDayLeave).map((leave) => leave.leave_date),
  );
  const sickFullDays = new Set(
    leaves
      .filter((leave) => isFullDayLeave(leave) && leave.kind === "sick")
      .map((leave) => leave.leave_date),
  );
  const breaksByDate = new Map<string, CoachWeekLeave[]>();
  for (const leave of leaves) {
    if (isFullDayLeave(leave)) {
      continue;
    }
    const rows = breaksByDate.get(leave.leave_date) ?? [];
    rows.push(leave);
    breaksByDate.set(leave.leave_date, rows);
  }
  const nowMinute =
    Number(formatInTimeZone(now, TIMEZONE, "H")) * 60 +
    Number(formatInTimeZone(now, TIMEZONE, "m"));
  const { start: gridStart, end: gridEnd } = weekGridRange([
    ...availabilities,
    ...leaves.flatMap((leave) =>
      leave.start_minute != null && leave.end_minute != null
        ? [{ start_minute: leave.start_minute, end_minute: leave.end_minute }]
        : [],
    ),
    ...assignedLessons.map((lesson) => {
      const range = lessonMinutesInHongKong(lesson.starts_at, lesson.ends_at);
      return {
        start_minute: range.startMinute,
        end_minute: range.endMinute,
      };
    }),
  ]);

  return (
    <div className="space-y-6">
      {loadError ? (
        <Panel title="未能載入">
          <p className="text-sm text-red-700">
            無法讀取可返工時間，請稍後再試。
          </p>
        </Panel>
      ) : (
        <Panel title="可返工時間週曆">
          <div className="space-y-3">
        <p className="text-sm text-stone-500">
          選擇指定日期及時段申報可返工，或申報 Short Break、放假、病假。已派更、待簽到的時段請加入實際上班時間後確認簽到；未加入的時段不計入薪資。每次新增、修改或刪除都會即時儲存。時間以
          30 分鐘為單位。
        </p>
            <div className="flex items-center justify-between gap-2">
              <Link
                href={coachWeekHref(prevWeek, month, day, view)}
                className="text-sm text-stone-600 underline"
                onClick={(event) =>
                  onWeekNavigate?.(
                    prevWeek,
                    coachWeekHref(prevWeek, month, day, view),
                    event,
                  )
                }
              >
                上週
              </Link>
              <p className="text-sm font-medium tabular-nums">
                {week} – {weekEnd}
              </p>
              <Link
                href={coachWeekHref(nextWeek, month, day, view)}
                className="text-sm text-stone-600 underline"
                onClick={(event) =>
                  onWeekNavigate?.(
                    nextWeek,
                    coachWeekHref(nextWeek, month, day, view),
                    event,
                  )
                }
              >
                下週
              </Link>
            </div>
            {week !== currentWeek ? (
              <Link
                href={coachWeekHref(currentWeek, month, day, view)}
                className="text-sm text-stone-600 underline"
                onClick={(event) =>
                  onWeekNavigate?.(
                    currentWeek,
                    coachWeekHref(currentWeek, month, day, view),
                    event,
                  )
                }
              >
                返回本週
              </Link>
            ) : null}
            <CalendarLegend />
            <WeekTimeGrid
              days={days}
              today={today}
              selectedDay={day}
              gridStart={gridStart}
              gridEnd={gridEnd}
              nowMinute={days.includes(today) ? nowMinute : null}
              allDay={(date) => {
                const onLeave = leaveDates.has(date);
                const suggestedStart = defaultStartMinute(date, today, now);
                const hasAssigned = dayHasLessonOnDate(date, assignedLessons);
                if (onLeave) {
                  return (
                    <div className="space-y-1">
                      <p className="rounded-sm bg-rose-100 px-1 py-1 text-center text-xs font-medium text-rose-900">
                        {sickFullDays.has(date) ? "全日病假" : "放假"}
                      </p>
                      {date >= today ? (
                        <CancelFullDayLeaveButton
                          date={date}
                          sick={sickFullDays.has(date)}
                        />
                      ) : null}
                    </div>
                  );
                }
                if (suggestedStart == null) {
                  return null;
                }
                return (
                  <StaffShiftComposer
                    date={date}
                    suggestedStart={suggestedStart}
                    canTakeFullDay={!hasAssigned}
                    compact
                  />
                );
              }}
              events={(date) => {
                if (leaveDates.has(date)) {
                  return null;
                }
                const breakBlocks = (breaksByDate.get(date) ?? []).map(
                  (leave) => {
                    const start = leave.start_minute ?? 0;
                    const end = leave.end_minute ?? 0;
                    const timeLabel = `${formatAvailabilityTime(start)}–${formatAvailabilityTime(end)}`;
                    const { top, height } = eventPosition(
                      start,
                      end,
                      gridStart,
                      gridEnd,
                    );
                    const shell =
                      "absolute right-0.5 left-0.5 z-[1] overflow-hidden rounded-sm border px-1 py-0.5 text-left text-xs leading-tight";
                    const started =
                      availabilityStartsAt(date, start) <= now;
                    if (!leave.id || date < today) {
                      return (
                        <div
                          key={leave.id ?? `${date}-${start}`}
                          className={`${shell} border-rose-300 bg-rose-100 text-rose-950`}
                          style={{ top, height }}
                        >
                          <p className="font-medium tabular-nums">{timeLabel}</p>
                          <p>{leave.kind === "sick" ? "病假" : "Short Break"}</p>
                        </div>
                      );
                    }
                    if (started || leave.kind === "sick") {
                      return (
                        <div
                          key={leave.id}
                          className={`${shell} border-rose-300 bg-rose-100 text-rose-950`}
                          style={{ top, height }}
                        >
                          <p className="font-medium tabular-nums">{timeLabel}</p>
                          <p>{leave.kind === "sick" ? "病假" : "Short Break"}</p>
                          <ServerActionButton
                            action={cancelLeaveByIdAction.bind(null, leave.id)}
                            confirmMessage={
                              leave.kind === "sick"
                                ? "確定撤銷此時段病假？可返工時間同未簽到派更會恢復。"
                                : "確定撤銷此時段放假？可返工時間會恢復。"
                            }
                            className="mt-1 min-h-8 w-full rounded-sm border border-rose-300 bg-white px-1 py-0.5 text-[10px] text-rose-900 disabled:opacity-60"
                          >
                            {leave.kind === "sick" ? "撤銷病假" : "撤銷"}
                          </ServerActionButton>
                        </div>
                      );
                    }
                    return (
                      <details
                        key={leave.id}
                        className={`${shell} border-rose-300 bg-rose-100 text-rose-950`}
                        style={{ top, height }}
                      >
                        <summary className="cursor-pointer list-none font-medium tabular-nums">
                          {leave.kind === "sick" ? `${timeLabel} 病假` : `${timeLabel} Short Break`}
                        </summary>
                        <div className="min-w-0 space-y-2 border-t border-rose-200 bg-white p-2 text-stone-900">
                          <ActionForm
                            action={saveShortBreakAction}
                            className="space-y-2"
                          >
                            <input
                              type="hidden"
                              name="leave_id"
                              value={leave.id}
                            />
                            <input
                              type="hidden"
                              name="leave_date"
                              value={date}
                            />
                            <AvailabilityTimeFields
                              defaultStartMinute={start}
                              defaultEndMinute={end}
                            />
                            <SubmitButton>儲存</SubmitButton>
                          </ActionForm>
                          <ServerActionButton
                            action={cancelLeaveByIdAction.bind(null, leave.id)}
                            confirmMessage="確定撤銷此時段放假？可返工時間會恢復。"
                            className="min-h-11 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-60"
                          >
                            撤銷
                          </ServerActionButton>
                        </div>
                      </details>
                    );
                  },
                );
                const availabilityBlocks = (byDate.get(date) ?? []).flatMap(
                  (availability) => {
                  if (availability.released) {
                    const timeLabel = `${formatAvailabilityTime(
                      availability.start_minute,
                    )}–${formatAvailabilityTime(availability.end_minute)}`;
                    const { top, height } = eventPosition(
                      availability.start_minute,
                      availability.end_minute,
                      gridStart,
                      gridEnd,
                    );
                    return [
                      <div
                        key={availability.id}
                        className="absolute right-0.5 left-0.5 z-[1] overflow-hidden rounded-sm border border-stone-300 bg-stone-200 px-1 py-0.5 text-left text-xs text-stone-700"
                        style={{ top, height }}
                      >
                        <p className="font-medium tabular-nums">{timeLabel}</p>
                        <p>{calendarSlotLabel(true)}</p>
                      </div>,
                    ];
                  }
                  const locked =
                    overlappingLesson(
                      date,
                      availability.start_minute,
                      availability.end_minute,
                      assignedLessons,
                    ) != null;
                  const editable = canEditAvailability(
                    availability,
                    now,
                    locked,
                  );
                  const shell =
                    "absolute right-0.5 left-0.5 z-[1] overflow-hidden rounded-sm border px-1 py-0.5 text-left text-xs leading-tight";
                  return availabilitySegments(
                    date,
                    availability.start_minute,
                    availability.end_minute,
                    assignedLessons,
                  ).map((segment) => {
                  const pending = segment.lesson?.status === "assigned";
                  const confirmed = segment.lesson?.status === "completed";
                  const timeLabel = `${formatAvailabilityTime(
                    segment.startMinute,
                  )}–${formatAvailabilityTime(segment.endMinute)}`;
                  const { top, height } = eventPosition(
                    segment.startMinute,
                    segment.endMinute,
                    gridStart,
                    gridEnd,
                  );
                  const key = `${availability.id}-${segment.startMinute}-${segment.endMinute}`;

                  if (pending && segment.lesson) {
                    const lessonWindow = lessonMinutesInHongKong(
                      segment.lesson.starts_at,
                      segment.lesson.ends_at,
                    );
                    return (
                      <div
                        key={key}
                        className={`${shell} border-dashed border-emerald-400 bg-emerald-100 text-emerald-950`}
                        style={{ top, height }}
                      >
                        <p className="font-medium tabular-nums">{timeLabel}</p>
                        <p>{calendarAssignmentLabel("assigned")}</p>
                        <details className="mt-1 rounded-sm border border-dashed border-emerald-300 bg-white text-stone-900">
                          <summary className="cursor-pointer list-none px-1 py-0.5 text-center font-medium">
                            簽到
                          </summary>
                          <div className="min-w-0 border-t border-emerald-100 p-2">
                            <LessonCheckInForm
                              lessonId={segment.lesson.id}
                              date={lessonWindow.date}
                              windowStart={lessonWindow.startMinute}
                              windowEnd={lessonWindow.endMinute}
                              workTypes={workTypes}
                              staffKind={staffKind}
                            />
                          </div>
                        </details>
                      </div>
                    );
                  }

                  if (confirmed && segment.lesson) {
                    const lessonWindow = lessonMinutesInHongKong(
                      segment.lesson.starts_at,
                      segment.lesson.ends_at,
                    );
                    return (
                      <details
                        key={key}
                        className={`${shell} border-sky-400 bg-sky-100 text-sky-950`}
                        style={{ top, height }}
                      >
                        <summary className="cursor-pointer list-none">
                          <p className="font-medium tabular-nums">{timeLabel}</p>
                          <p>{calendarAssignmentLabel("completed")} 修改</p>
                        </summary>
                        <div className="min-w-0 border-t border-sky-100 bg-white p-2 text-stone-900">
                          <LessonCheckInForm
                            lessonId={segment.lesson.id}
                            date={lessonWindow.date}
                            windowStart={availability.start_minute}
                            windowEnd={availability.end_minute}
                            initialPeriods={[
                              {
                                startMinute: lessonWindow.startMinute,
                                endMinute: lessonWindow.endMinute,
                              },
                            ]}
                            initialLessonTypeId={segment.lesson.lesson_type_id}
                            workTypes={workTypes}
                            staffKind={staffKind}
                            submitLabel="儲存修改"
                          />
                          <ServerActionButton
                            action={undoCheckInAction.bind(null, segment.lesson.id)}
                            confirmMessage="確定撤銷簽到？會回到待簽到，本次薪資不會計算。"
                            className="mt-2 min-h-11 w-full rounded-md border border-sky-200 px-2 py-1 text-xs text-sky-900 disabled:opacity-60"
                          >
                            撤銷簽到
                          </ServerActionButton>
                        </div>
                      </details>
                    );
                  }

                  if (!editable) {
                    return (
                      <div
                        key={key}
                        className={`${shell} ${
                          locked
                            ? "border-amber-200 bg-amber-50 text-amber-900"
                            : "border-stone-200 bg-stone-100 text-stone-600"
                        }`}
                        style={{ top, height }}
                      >
                        <p className="font-medium tabular-nums">{timeLabel}</p>
                        <p>{locked ? "待公司派更" : "已開始"}</p>
                      </div>
                    );
                  }

                  return (
                    <details
                      key={key}
                      className={`${shell} border-amber-300 bg-amber-100 text-amber-950`}
                      style={{ top, height }}
                    >
                      <summary className="cursor-pointer list-none font-medium tabular-nums">
                        {timeLabel} 修改
                      </summary>
                      <div className="min-w-0 space-y-2 border-t border-sky-200 bg-white p-2 text-stone-900">
                        <ActionForm
                          action={saveAvailabilityAction}
                          className="space-y-2"
                        >
                          <input
                            type="hidden"
                            name="availability_id"
                            value={availability.id}
                          />
                          <input
                            type="hidden"
                            name="available_date"
                            value={date}
                          />
                          <AvailabilityTimeFields
                            defaultStartMinute={availability.start_minute}
                            defaultEndMinute={availability.end_minute}
                          />
                          <SubmitButton>儲存</SubmitButton>
                        </ActionForm>
                        <ServerActionButton
                          action={deleteAvailabilityAction.bind(
                            null,
                            availability.id,
                          )}
                          confirmMessage="確定刪除此可返工時段？"
                          className="min-h-11 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-60"
                        >
                          刪除
                        </ServerActionButton>
                      </div>
                    </details>
                  );
                });
                },
                );
                return [...breakBlocks, ...availabilityBlocks];
              }}
            />
            <p className="mt-2 text-sm text-stone-500">
              請於頂列申報放假或新增時段。色塊對齊整點；紅線表示現在時間。
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}
