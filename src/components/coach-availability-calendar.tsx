import {
  cancelLeaveAction,
  deleteAvailabilityAction,
  saveAvailabilityAction,
  saveLeaveAction,
} from "@/actions/availability";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { ServerActionButton } from "@/components/server-action-button";
import { Panel, SubmitButton } from "@/components/ui";
import {
  availabilityWeekBoundsIso,
  availabilityWeekDays,
  availabilityWeekStart,
  hongKongToday,
  parseAvailabilityWeekParam,
  shiftAvailabilityWeek,
} from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import { formatAvailabilityTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { StaffAvailability, StaffLeave } from "@/lib/types";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import Link from "next/link";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const DEFAULT_START_MINUTE = 9 * 60;
const DEFAULT_DURATION_MINUTES = 60;
const MINUTES_PER_DAY = 1440;

function availabilityStartsAt(date: string, startMinute: number): Date {
  const hour = String(Math.floor(startMinute / 60)).padStart(2, "0");
  const minute = String(startMinute % 60).padStart(2, "0");
  return fromZonedTime(`${date}T${hour}:${minute}:00`, TIMEZONE);
}

function lessonMinutes(startsAt: string, endsAt: string): {
  date: string;
  startMinute: number;
  endMinute: number;
} {
  const date = formatInTimeZone(startsAt, TIMEZONE, "yyyy-MM-dd");
  const startMinute =
    Number(formatInTimeZone(startsAt, TIMEZONE, "H")) * 60 +
    Number(formatInTimeZone(startsAt, TIMEZONE, "m"));
  const endMinute =
    Number(formatInTimeZone(endsAt, TIMEZONE, "H")) * 60 +
    Number(formatInTimeZone(endsAt, TIMEZONE, "m"));
  return { date, startMinute, endMinute };
}

function isAvailabilityLocked(
  date: string,
  startMinute: number,
  endMinute: number,
  lessons: { starts_at: string; ends_at: string }[],
): boolean {
  return lessons.some((lesson) => {
    const range = lessonMinutes(lesson.starts_at, lesson.ends_at);
    return (
      range.date === date &&
      range.startMinute < endMinute &&
      range.endMinute > startMinute
    );
  });
}

function dayHasAssignedLesson(
  date: string,
  lessons: { starts_at: string; ends_at: string }[],
): boolean {
  return lessons.some(
    (lesson) => lessonMinutes(lesson.starts_at, lesson.ends_at).date === date,
  );
}

function canEditAvailability(
  availability: StaffAvailability,
  now: Date,
  locked: boolean,
): boolean {
  if (locked) {
    return false;
  }
  return availabilityStartsAt(
    availability.available_date,
    availability.start_minute,
  ) > now;
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
): string {
  return `/coach?month=${month}&day=${day}&week=${week}#availability`;
}

export async function CoachAvailabilityCalendar({
  coachId,
  weekParam,
  month,
  day,
}: {
  coachId: string;
  weekParam?: string;
  month: string;
  day: string;
}) {
  const week = parseAvailabilityWeekParam(weekParam);
  const currentWeek = availabilityWeekStart();
  const prevWeek = shiftAvailabilityWeek(week, -1);
  const nextWeek = shiftAvailabilityWeek(week, 1);
  const days = availabilityWeekDays(week);
  const weekEnd = days[6];
  const { start: weekStartIso, end: weekEndIso } =
    availabilityWeekBoundsIso(week);
  const now = new Date();
  const today = hongKongToday();
  const supabase = await createClient();
  const [
    { data: availabilities, error },
    { data: leaves, error: leavesError },
    { data: lessons },
  ] = await Promise.all([
    supabase
      .from("staff_availabilities")
      .select(
        "id, coach_id, available_date, start_minute, end_minute, created_at, updated_at",
      )
      .eq("coach_id", coachId)
      .gte("available_date", week)
      .lte("available_date", weekEnd)
      .order("available_date")
      .order("start_minute"),
    supabase
      .from("staff_leaves")
      .select("id, coach_id, leave_date, created_at")
      .eq("coach_id", coachId)
      .gte("leave_date", week)
      .lte("leave_date", weekEnd),
    supabase
      .from("lessons")
      .select("starts_at, ends_at")
      .eq("coach_id", coachId)
      .in("status", ["assigned", "completed"])
      .gte("starts_at", weekStartIso)
      .lt("starts_at", weekEndIso),
  ]);

  if (error || leavesError) {
    console.error("[CoachAvailabilityCalendar] load availability", {
      error,
      leavesError,
      coachId,
      week,
    });
  }

  const assignedLessons = lessons ?? [];
  const byDate = new Map<string, StaffAvailability[]>();
  for (const availability of (availabilities ?? []) as StaffAvailability[]) {
    const rows = byDate.get(availability.available_date) ?? [];
    rows.push(availability);
    byDate.set(availability.available_date, rows);
  }
  const leaveDates = new Set(
    ((leaves ?? []) as StaffLeave[]).map((leave) => leave.leave_date),
  );

  return (
    <div className="space-y-6">
      <Panel title="提交可返工時間">
        <p className="text-sm text-stone-500">
          選擇指定日期及時段，或報全日放假。每次新增、修改或刪除都會即時儲存。時間以
          30 分鐘為單位。
        </p>
        <div className="flex items-center justify-between gap-2">
          <Link
            href={coachWeekHref(prevWeek, month, day)}
            className="text-sm text-stone-600 underline"
          >
            上週
          </Link>
          <p className="text-sm font-medium">
            {week} – {weekEnd}
          </p>
          <Link
            href={coachWeekHref(nextWeek, month, day)}
            className="text-sm text-stone-600 underline"
          >
            下週
          </Link>
        </div>
        {week !== currentWeek ? (
          <Link
            href={coachWeekHref(currentWeek, month, day)}
            className="text-sm text-stone-600 underline"
          >
            返回本週
          </Link>
        ) : null}
      </Panel>

      {error || leavesError ? (
        <Panel title="未能載入">
          <p className="text-sm text-red-700">
            無法讀取可返工時間，請稍後再試。
          </p>
        </Panel>
      ) : (
        <Panel title="可返工時間週曆">
          <div className="overflow-x-auto">
            <div className="grid min-w-[1260px] grid-cols-7 overflow-hidden rounded-lg border border-stone-200">
              {days.map((date, dayIndex) => {
                const onLeave = leaveDates.has(date);
                const dayAvailabilities = onLeave
                  ? []
                  : (byDate.get(date) ?? []);
                const suggestedStart = defaultStartMinute(date, today, now);
                const hasAssigned = dayHasAssignedLesson(date, assignedLessons);
                const columnFilled = onLeave || dayAvailabilities.length > 0;
                return (
                  <section
                    key={date}
                    className={`min-h-80 border-l border-stone-200 first:border-l-0 ${
                      onLeave
                        ? "bg-rose-50"
                        : columnFilled
                          ? "bg-white"
                          : "bg-stone-100"
                    }`}
                  >
                    <div
                      className={`border-b border-stone-200 px-3 py-3 text-center ${
                        onLeave
                          ? "bg-rose-100"
                          : columnFilled
                            ? "bg-white"
                            : "bg-stone-200"
                      } ${date === today ? "ring-2 ring-inset ring-sky-400" : ""}`}
                    >
                      <p className="font-semibold">
                        星期{WEEKDAY_LABELS[dayIndex]}
                      </p>
                      <p className="text-sm text-stone-500">{date.slice(5)}</p>
                    </div>
                    <div className="space-y-3 p-2">
                      {onLeave ? (
                        <div className="space-y-2">
                          <p className="rounded-md bg-rose-100 px-2 py-2 text-center text-sm font-medium text-rose-900">
                            放假
                          </p>
                          {suggestedStart != null ? (
                            <ServerActionButton
                              action={cancelLeaveAction.bind(null, date)}
                              confirmMessage="確定取消這天放假？"
                              className="w-full rounded-md border border-rose-200 px-3 py-2 text-sm text-rose-800 disabled:opacity-60"
                            >
                              取消放假
                            </ServerActionButton>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          {dayAvailabilities.map((availability) => {
                            const locked = isAvailabilityLocked(
                              date,
                              availability.start_minute,
                              availability.end_minute,
                              assignedLessons,
                            );
                            const editable = canEditAvailability(
                              availability,
                              now,
                              locked,
                            );
                            const timeLabel = `${formatAvailabilityTime(
                              availability.start_minute,
                            )} – ${formatAvailabilityTime(
                              availability.end_minute,
                            )}`;

                            if (!editable) {
                              return (
                                <div
                                  key={availability.id}
                                  className="rounded-md bg-stone-100 px-2 py-2 text-sm"
                                >
                                  <p className="font-medium">{timeLabel}</p>
                                  <p className="text-xs text-stone-500">
                                    {locked ? "已有派更，不可修改" : "已開始"}
                                  </p>
                                </div>
                              );
                            }

                            return (
                              <details
                                key={availability.id}
                                className="rounded-md bg-sky-100 text-sm text-sky-950"
                              >
                                <summary className="cursor-pointer list-none px-2 py-2 font-medium">
                                  {timeLabel}
                                  <span className="ml-1 text-xs font-normal">
                                    修改
                                  </span>
                                </summary>
                                <div className="space-y-2 border-t border-sky-200 bg-white p-2 text-stone-900">
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
                                      defaultStartMinute={
                                        availability.start_minute
                                      }
                                      defaultEndMinute={
                                        availability.end_minute
                                      }
                                    />
                                    <SubmitButton>儲存</SubmitButton>
                                  </ActionForm>
                                  <ServerActionButton
                                    action={deleteAvailabilityAction.bind(
                                      null,
                                      availability.id,
                                    )}
                                    confirmMessage="確定刪除此可返工時段？"
                                    className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-60"
                                  >
                                    刪除
                                  </ServerActionButton>
                                </div>
                              </details>
                            );
                          })}

                          {dayAvailabilities.length === 0 ? (
                            <p className="py-4 text-center text-sm font-medium text-stone-500">
                              未報
                            </p>
                          ) : null}

                          {suggestedStart != null ? (
                            <>
                              <details className="rounded-md border border-dashed border-stone-300 bg-white text-sm">
                                <summary className="cursor-pointer list-none px-2 py-2 text-center font-medium text-stone-600">
                                  ＋ 新增時段
                                </summary>
                                <ActionForm
                                  action={saveAvailabilityAction}
                                  className="space-y-3 border-t border-stone-200 p-2"
                                >
                                  <input
                                    type="hidden"
                                    name="available_date"
                                    value={date}
                                  />
                                  <AvailabilityTimeFields
                                    defaultStartMinute={suggestedStart}
                                    defaultEndMinute={Math.min(
                                      suggestedStart +
                                        DEFAULT_DURATION_MINUTES,
                                      MINUTES_PER_DAY,
                                    )}
                                  />
                                  <SubmitButton>新增</SubmitButton>
                                </ActionForm>
                              </details>
                              {hasAssigned ? (
                                <p className="text-center text-xs text-stone-500">
                                  當日已有派更，不可報放假
                                </p>
                              ) : (
                                <ServerActionButton
                                  action={saveLeaveAction.bind(null, date)}
                                  confirmMessage={
                                    dayAvailabilities.length > 0
                                      ? "將取消當日已報的可返工時段，改為全日放假。確定？"
                                      : "確定這天全日放假？"
                                  }
                                  className="w-full rounded-md border border-rose-200 px-3 py-2 text-sm text-rose-800 disabled:opacity-60"
                                >
                                  報放假
                                </ServerActionButton>
                              )}
                            </>
                          ) : null}
                        </>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-stone-400">
            灰色代表未報；白色代表已提交可返工時間；粉紅代表放假。手機可左右滑動日曆。
          </p>
        </Panel>
      )}
    </div>
  );
}
