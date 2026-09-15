"use client";

import { confirmLessonAction } from "@/actions/lessons";
import {
  cancelLeaveAction,
  deleteAvailabilityAction,
  saveAvailabilityAction,
  saveLeaveAction,
} from "@/actions/availability";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { ServerActionButton } from "@/components/server-action-button";
import { CalendarLegend } from "@/components/calendar-legend";
import { Panel, SubmitButton } from "@/components/ui";
import { WeekTimeGrid, eventPosition } from "@/components/week-time-grid";
import {
  overlappingLesson,
  availabilityWeekDays,
  availabilityWeekStart,
  dayHasLessonOnDate,
  hongKongToday,
  shiftAvailabilityWeek,
  type CalendarView,
} from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import { formatAvailabilityTime } from "@/lib/format";
import { weekGridRange } from "@/lib/week-grid";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { coachCalendarHref } from "@/lib/coach-href";
import Link from "next/link";
import type { MouseEvent } from "react";

const DEFAULT_START_MINUTE = 9 * 60;
const DEFAULT_DURATION_MINUTES = 60;
const MINUTES_PER_DAY = 1440;

export type CoachWeekSlot = {
  id: string;
  coach_id: string;
  available_date: string;
  start_minute: number;
  end_minute: number;
};

export type CoachWeekLeave = {
  leave_date: string;
};

export type CoachWeekLesson = {
  id: string;
  starts_at: string;
  ends_at: string;
  status?: string;
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
  const leaveDates = new Set(leaves.map((leave) => leave.leave_date));
  const nowMinute =
    Number(formatInTimeZone(now, TIMEZONE, "H")) * 60 +
    Number(formatInTimeZone(now, TIMEZONE, "m"));
  const { start: gridStart, end: gridEnd } = weekGridRange(availabilities);

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
              選擇指定日期及時段，或報全日放假。每次新增、修改或刪除都會即時儲存。時間以
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
                const dayAvailabilities = onLeave
                  ? []
                  : (byDate.get(date) ?? []);
                const suggestedStart = defaultStartMinute(date, today, now);
                const hasAssigned = dayHasLessonOnDate(date, assignedLessons);
                if (onLeave) {
                  return (
                    <div className="space-y-1">
                      <p className="rounded-sm bg-rose-100 px-1 py-1 text-center text-xs font-medium text-rose-900">
                        放假
                      </p>
                      {suggestedStart != null ? (
                        <ServerActionButton
                          action={cancelLeaveAction.bind(null, date)}
                          confirmMessage="確定取消這天放假？"
                          className="w-full min-h-11 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-800 disabled:opacity-60"
                        >
                          取消放假
                        </ServerActionButton>
                      ) : null}
                    </div>
                  );
                }
                if (suggestedStart == null) {
                  return null;
                }
                return (
                  <div className="space-y-1">
                    <details className="relative z-[2] rounded-sm border border-dashed border-stone-300 bg-white text-xs">
                      <summary className="cursor-pointer list-none px-1 py-1 text-center font-medium text-stone-600">
                        ＋ 新增
                      </summary>
                      <ActionForm
                        action={saveAvailabilityAction}
                        className="min-w-[9rem] space-y-2 border-t border-stone-200 p-2"
                      >
                        <input
                          type="hidden"
                          name="available_date"
                          value={date}
                        />
                        <AvailabilityTimeFields
                          defaultStartMinute={suggestedStart}
                          defaultEndMinute={Math.min(
                            suggestedStart + DEFAULT_DURATION_MINUTES,
                            MINUTES_PER_DAY,
                          )}
                        />
                        <SubmitButton>新增</SubmitButton>
                      </ActionForm>
                    </details>
                    {hasAssigned ? (
                      <p className="text-center text-[10px] text-stone-500">
                        已有派更，不可放假
                      </p>
                    ) : (
                      <ServerActionButton
                        action={saveLeaveAction.bind(null, date)}
                        confirmMessage={
                          dayAvailabilities.length > 0
                            ? "將取消當日已報的可返工時段，改為全日放假。確定？"
                            : "確定這天全日放假？"
                        }
                        className="w-full min-h-11 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-800 disabled:opacity-60"
                      >
                        報放假
                      </ServerActionButton>
                    )}
                  </div>
                );
              }}
              events={(date) => {
                if (leaveDates.has(date)) {
                  return null;
                }
                return (byDate.get(date) ?? []).map((availability) => {
                  const overlap = overlappingLesson(
                    date,
                    availability.start_minute,
                    availability.end_minute,
                    assignedLessons,
                  );
                  const pending = overlap?.status === "assigned";
                  const confirmed = overlap?.status === "completed";
                  const locked = overlap != null;
                  const editable = canEditAvailability(
                    availability,
                    now,
                    locked,
                  );
                  const timeLabel = `${formatAvailabilityTime(
                    availability.start_minute,
                  )}–${formatAvailabilityTime(availability.end_minute)}`;
                  const { top, height } = eventPosition(
                    availability.start_minute,
                    availability.end_minute,
                    gridStart,
                    gridEnd,
                  );
                  const shell =
                    "absolute right-0.5 left-0.5 z-[1] overflow-auto rounded-sm border px-1 py-0.5 text-left text-xs";

                  if (pending && overlap) {
                    const canConfirm = new Date(overlap.starts_at) > now;
                    return (
                      <div
                        key={availability.id}
                        className={`${shell} border-dashed border-amber-400 bg-amber-100 text-amber-950`}
                        style={{ top, height }}
                      >
                        <p className="font-medium tabular-nums">{timeLabel}</p>
                        <p>待確認</p>
                        {canConfirm ? (
                          <ServerActionButton
                            action={confirmLessonAction.bind(null, overlap.id)}
                            confirmMessage="確定接受此派更？確認後才計入薪資。"
                            className="mt-1 w-full min-h-11 rounded-md bg-stone-900 px-2 py-1 text-xs text-white disabled:opacity-60"
                          >
                            確認
                          </ServerActionButton>
                        ) : (
                          <p className="text-amber-800">已過開始時間</p>
                        )}
                      </div>
                    );
                  }

                  if (confirmed) {
                    return (
                      <div
                        key={availability.id}
                        className={`${shell} border-emerald-400 bg-emerald-100 text-emerald-950`}
                        style={{ top, height }}
                      >
                        <p className="font-medium tabular-nums">{timeLabel}</p>
                        <p>已確認</p>
                      </div>
                    );
                  }

                  if (!editable) {
                    return (
                      <div
                        key={availability.id}
                        className={`${shell} border-stone-200 bg-stone-100 text-stone-600`}
                        style={{ top, height }}
                      >
                        <p className="font-medium tabular-nums">{timeLabel}</p>
                        <p>已開始</p>
                      </div>
                    );
                  }

                  return (
                    <details
                      key={availability.id}
                      className={`${shell} overflow-visible border-sky-300 bg-sky-100 text-sky-950`}
                      style={{ top, height }}
                    >
                      <summary className="cursor-pointer list-none font-medium tabular-nums">
                        {timeLabel} 修改
                      </summary>
                      <div className="min-w-[9rem] space-y-2 border-t border-sky-200 bg-white p-2 text-stone-900">
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
              }}
            />
            <p className="mt-2 text-sm text-stone-500">
              頂列報放假或新增時段。色塊對齊小時；紅線＝現在。
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}
