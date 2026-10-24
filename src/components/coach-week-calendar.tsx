"use client";

import {
  cancelLeaveByIdAction,
  deleteAvailabilityAction,
  saveAvailabilityAction,
  saveShortBreakAction,
} from "@/actions/availability";
import { undoCheckInAction } from "@/actions/lessons";
import { ActionForm } from "@/components/action-form";
import { Alert } from "@/components/alert";
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
  takeCompletedLessonOnce,
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
  checkedInLabel,
  calendarSlotLabel,
  formatAvailabilityTime,
} from "@/lib/format";
import { weekGridRange } from "@/lib/week-grid";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  COACH_SCHEDULE_SCOPE_EVENT,
  coachCalendarHref,
  parseCoachScheduleScope,
  type CoachScheduleScope,
} from "@/lib/coach-href";
import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";

const DEFAULT_START_MINUTE = 9 * 60;
const SHIFT_STEP_MINUTES = 15;
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
  student_names?: string[];
};

export type StaffWorkTypeOption = {
  id: string;
  name: string;
  registersStudent: boolean;
};

function availabilityStartsAt(date: string, startMinute: number): Date {
  const hour = String(Math.floor(startMinute / 60)).padStart(2, "0");
  const minute = String(startMinute % 60).padStart(2, "0");
  return fromZonedTime(`${date}T${hour}:${minute}:00`, TIMEZONE);
}

function canEditAvailability(locked: boolean): boolean {
  return !locked;
}

function defaultStartMinute(
  date: string,
  today: string,
  now: Date,
): number | null {
  if (date < today) {
    return DEFAULT_START_MINUTE;
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
  view: CalendarView | undefined,
  scope: CoachScheduleScope,
): string {
  return coachCalendarHref({
    month,
    day,
    week,
    view,
    scope,
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
  scope = "all",
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
  scope?: CoachScheduleScope;
  loadError?: boolean;
  onWeekNavigate?: (
    week: string,
    href: string,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void;
}) {
  const [linkedScope, setLinkedScope] = useState(scope);
  const [scopeFromProps, setScopeFromProps] = useState(scope);
  const [openCheckIn, setOpenCheckIn] = useState<{
    lessonId: string;
    date: string;
    windowStart: number;
    windowEnd: number;
    timeLabel: string;
    registered: boolean;
    initialStart: number;
    initialEnd: number;
    initialStudentNames: string[];
    initialLessonTypeId?: string;
  } | null>(null);
  if (scope !== scopeFromProps) {
    setScopeFromProps(scope);
    setLinkedScope(scope);
  }
  useEffect(() => {
    function syncScope() {
      const params = new URLSearchParams(window.location.search);
      setLinkedScope(parseCoachScheduleScope(params.get("scope")));
    }
    window.addEventListener("popstate", syncScope);
    window.addEventListener(COACH_SCHEDULE_SCOPE_EVENT, syncScope);
    return () => {
      window.removeEventListener("popstate", syncScope);
      window.removeEventListener(COACH_SCHEDULE_SCOPE_EVENT, syncScope);
    };
  }, []);
  useEffect(() => {
    if (!openCheckIn) {
      return;
    }
    document.getElementById("week-check-in")?.scrollIntoView({ block: "nearest" });
  }, [openCheckIn]);
  const typeNameById = new Map(workTypes.map((type) => [type.id, type.name]));
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
          <Alert variant="filled" severity="error">
            無法讀取可返工時間，請稍後再試。
          </Alert>
        </Panel>
      ) : (
        <Panel title="可返工時間週曆">
          <div className="space-y-3">
        <p className="text-sm text-stone-500">
          選擇指定日期及時段申報可返工，或申報小休、放假、病假。已派更、待簽到的時段請按色塊上的簽到，在週曆下方確認。每次新增、修改或刪除都會即時儲存。可返工時間以
          15 分鐘為單位；放假、病假同簽到仍然以 30 分鐘為單位。
        </p>
            <div className="flex items-center justify-between gap-2">
              <Link
                href={coachWeekHref(prevWeek, month, day, view, linkedScope)}
                className="text-sm text-stone-600 underline"
                onClick={(event) =>
                  onWeekNavigate?.(
                    prevWeek,
                    coachWeekHref(prevWeek, month, day, view, linkedScope),
                    event,
                  )
                }
              >
                上週
              </Link>
              <p className="text-base font-bold tabular-nums tracking-tight">
                {week} – {weekEnd}
              </p>
              <Link
                href={coachWeekHref(nextWeek, month, day, view, linkedScope)}
                className="text-sm text-stone-600 underline"
                onClick={(event) =>
                  onWeekNavigate?.(
                    nextWeek,
                    coachWeekHref(nextWeek, month, day, view, linkedScope),
                    event,
                  )
                }
              >
                下週
              </Link>
            </div>
            {week !== currentWeek ? (
              <Link
                href={coachWeekHref(currentWeek, month, day, view, linkedScope)}
                className="text-sm text-stone-600 underline"
                onClick={(event) =>
                  onWeekNavigate?.(
                    currentWeek,
                    coachWeekHref(currentWeek, month, day, view, linkedScope),
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
                      <p
                        className={`rounded-sm px-1 py-1 text-center text-xs font-medium ${
                          sickFullDays.has(date)
                            ? "bg-red-100 text-red-900"
                            : "bg-stone-100 text-stone-900"
                        }`}
                      >
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
                    pendingShiftLabels={assignedLessons.flatMap((lesson) => {
                      if (lesson.status !== "assigned") {
                        return [];
                      }
                      const window = lessonMinutesInHongKong(
                        lesson.starts_at,
                        lesson.ends_at,
                      );
                      if (window.date !== date) {
                        return [];
                      }
                      return [
                        `${formatAvailabilityTime(window.startMinute)}–${formatAvailabilityTime(window.endMinute)}`,
                      ];
                    })}
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
                    const blockTone =
                      leave.kind === "sick"
                        ? "border-red-300 bg-red-100 text-red-950"
                        : "border-stone-300 bg-stone-100 text-stone-950";
                    const started =
                      availabilityStartsAt(date, start) <= now;
                    if (!leave.id || date < today) {
                      return (
                        <div
                          key={leave.id ?? `${date}-${start}`}
                          className={`${shell} ${blockTone}`}
                          style={{ top, height }}
                        >
                          <p className="font-bold tabular-nums">{timeLabel}</p>
                          <p>{leave.kind === "sick" ? "病假" : "小休"}</p>
                        </div>
                      );
                    }
                    if (started || leave.kind === "sick") {
                      return (
                        <div
                          key={leave.id}
                          className={`${shell} ${blockTone}`}
                          style={{ top, height }}
                        >
                          <p className="font-bold tabular-nums">{timeLabel}</p>
                          <p>{leave.kind === "sick" ? "病假" : "小休"}</p>
                          <ServerActionButton
                            action={cancelLeaveByIdAction.bind(null, leave.id)}
                            confirmMessage={
                              leave.kind === "sick"
                                ? "確定撤銷此時段病假？"
                                : "確定撤銷此時段放假？"
                            }
                            confirmLabel={
                              leave.kind === "sick" ? "確定撤銷病假" : "確定撤銷放假"
                            }
                            confirmVariant={
                              leave.kind === "sick" ? "sickQuiet" : "leaveQuiet"
                            }
                            className={
                              leave.kind === "sick"
                                ? "mt-1 min-h-8 w-full rounded-sm border border-red-300 bg-white px-1 py-0.5 text-[10px] text-red-900 disabled:opacity-60"
                                : "mt-1 min-h-8 w-full rounded-sm border border-stone-300 bg-white px-1 py-0.5 text-[10px] text-stone-900 disabled:opacity-60"
                            }
                          >
                            {leave.kind === "sick" ? "撤銷病假" : "撤銷放假"}
                          </ServerActionButton>
                        </div>
                      );
                    }
                    return (
                      <details
                        key={leave.id}
                        className={`${shell} border-stone-300 bg-stone-100 text-stone-950`}
                        style={{ top, height }}
                      >
                        <summary className="cursor-pointer list-none font-bold tabular-nums">
                          {leave.kind === "sick" ? `${timeLabel} 病假` : `${timeLabel} 小休`}
                        </summary>
                        <div className="min-w-0 space-y-2 border-t border-stone-200 bg-white p-2 text-stone-900">
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
                            <SubmitButton>儲存修改</SubmitButton>
                          </ActionForm>
                          <ServerActionButton
                            action={cancelLeaveByIdAction.bind(null, leave.id)}
                            confirmMessage="確定撤銷此時段放假？可返工時間會恢復。"
                            confirmLabel="確定撤銷放假"
                            confirmVariant="leaveQuiet"
                            variant="leaveQuiet"
                            className="w-full"
                          >
                            撤銷放假
                          </ServerActionButton>
                        </div>
                      </details>
                    );
                  },
                );
                const seenCompleted = new Set<string>();
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
                        <p className="font-bold tabular-nums">{timeLabel}</p>
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
                  const editable = canEditAvailability(locked);
                  const shell =
                    "absolute right-0.5 left-0.5 z-[1] overflow-hidden rounded-sm border px-1 py-0.5 text-left text-xs leading-tight";
                  return availabilitySegments(
                    date,
                    availability.start_minute,
                    availability.end_minute,
                    assignedLessons,
                  )
                    .filter((segment) =>
                      takeCompletedLessonOnce(segment, seenCompleted),
                    )
                    .map((segment) => {
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
                    const lesson = segment.lesson;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`${shell} cursor-pointer border-dashed border-emerald-400 bg-emerald-100 text-emerald-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]`}
                        style={{ top, height }}
                        aria-expanded={openCheckIn?.lessonId === lesson.id}
                        aria-controls="week-check-in"
                        onClick={() =>
                          setOpenCheckIn({
                            lessonId: lesson.id,
                            date: lessonWindow.date,
                            windowStart: lessonWindow.startMinute,
                            windowEnd: lessonWindow.endMinute,
                            timeLabel,
                            registered: false,
                            initialStart: lessonWindow.startMinute,
                            initialEnd: lessonWindow.endMinute,
                            initialStudentNames: [],
                          })
                        }
                      >
                        <p className="font-bold tabular-nums">{timeLabel} 簽到</p>
                        <p>{calendarAssignmentLabel("assigned")}</p>
                      </button>
                    );
                  }

                  if (confirmed && segment.lesson) {
                    const lessonWindow = lessonMinutesInHongKong(
                      segment.lesson.starts_at,
                      segment.lesson.ends_at,
                    );
                    const lesson = segment.lesson;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`${shell} cursor-pointer border-sky-400 bg-sky-100 text-sky-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]`}
                        style={{ top, height }}
                        aria-expanded={openCheckIn?.lessonId === lesson.id}
                        aria-controls="week-check-in"
                        onClick={() =>
                          setOpenCheckIn({
                            lessonId: lesson.id,
                            date: lessonWindow.date,
                            windowStart: availability.start_minute,
                            windowEnd: availability.end_minute,
                            timeLabel,
                            registered: true,
                            initialStart: lessonWindow.startMinute,
                            initialEnd: lessonWindow.endMinute,
                            initialStudentNames: lesson.student_names ?? [],
                            initialLessonTypeId: lesson.lesson_type_id,
                          })
                        }
                      >
                        <p className="font-bold tabular-nums">{timeLabel} 修改</p>
                        <p>
                          {checkedInLabel({
                            typeName: typeNameById.get(lesson.lesson_type_id ?? ""),
                            studentNames: lesson.student_names,
                          })}
                        </p>
                      </button>
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
                        <p className="font-bold tabular-nums">{timeLabel}</p>
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
                      <summary className="cursor-pointer list-none font-bold tabular-nums">
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
                            stepMinutes={SHIFT_STEP_MINUTES}
                            defaultStartMinute={availability.start_minute}
                            defaultEndMinute={availability.end_minute}
                          />
                          <SubmitButton>儲存可返工時間</SubmitButton>
                        </ActionForm>
                        <ServerActionButton
                          action={deleteAvailabilityAction.bind(
                            null,
                            availability.id,
                          )}
                          confirmMessage="確定刪除此可返工時段？"
                          confirmLabel="確定刪除"
                          confirmVariant="danger"
                          variant="danger"
                          className="w-full"
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
            {openCheckIn ? (
              <div
                id="week-check-in"
                className="scroll-mt-4 rounded-md border border-stone-200 bg-white p-3"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-[#2C2C2C]">
                    <span className="tabular-nums">{openCheckIn.timeLabel}</span>{" "}
                    {openCheckIn.registered ? "已簽到" : "簽到"}
                  </p>
                  <button
                    type="button"
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm font-semibold text-[#2C2C2C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]"
                    onClick={() => setOpenCheckIn(null)}
                  >
                    關閉
                  </button>
                </div>
                <LessonCheckInForm
                  key={openCheckIn.lessonId}
                  lessonId={openCheckIn.lessonId}
                  date={openCheckIn.date}
                  windowStart={openCheckIn.windowStart}
                  windowEnd={openCheckIn.windowEnd}
                  initialPeriods={
                    openCheckIn.registered
                      ? [
                          {
                            startMinute: openCheckIn.initialStart,
                            endMinute: openCheckIn.initialEnd,
                          },
                        ]
                      : []
                  }
                  initialStudentNames={openCheckIn.initialStudentNames}
                  initialLessonTypeId={openCheckIn.initialLessonTypeId}
                  workTypes={workTypes}
                  staffKind={staffKind}
                  submitLabel={openCheckIn.registered ? "儲存修改" : "確認簽到"}
                  initiallyEditing={openCheckIn.registered}
                  sideAction={
                    openCheckIn.registered ? (
                      <ServerActionButton
                        action={undoCheckInAction.bind(null, openCheckIn.lessonId)}
                        confirmMessage="確定撤銷簽到？會回到待簽到，本次薪資不會計算。"
                        confirmLabel="確定撤銷簽到"
                        confirmVariant="confirmedQuiet"
                        variant="confirmedQuiet"
                        className="w-full"
                      >
                        撤銷簽到
                      </ServerActionButton>
                    ) : null
                  }
                />
              </div>
            ) : null}
            <p className="mt-2 text-sm text-stone-500">
              請於頂列申報放假或新增時段。色塊對齊整點；紅線表示現在時間。
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}
