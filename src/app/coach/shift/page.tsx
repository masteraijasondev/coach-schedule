import {
  deleteAvailabilityAction,
  saveAvailabilityAction,
} from "@/actions/availability";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { ServerActionButton } from "@/components/server-action-button";
import { Panel, SubmitButton } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import {
  availabilityWeekDays,
  availabilityWeekStarts,
  hongKongToday,
  parseAvailabilityWeekParam,
} from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import { formatAvailabilityTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { StaffAvailability } from "@/lib/types";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import Link from "next/link";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const DEFAULT_START_MINUTE = 9 * 60;
const DEFAULT_DURATION_MINUTES = 60;
const MINUTES_PER_DAY = 1440;

type Props = {
  searchParams: Promise<{ week?: string }>;
};

function availabilityStartsAt(
  date: string,
  startMinute: number,
): Date {
  const hour = String(Math.floor(startMinute / 60)).padStart(2, "0");
  const minute = String(startMinute % 60).padStart(2, "0");
  return fromZonedTime(`${date}T${hour}:${minute}:00`, TIMEZONE);
}

function canEditAvailability(
  availability: StaffAvailability,
  now: Date,
): boolean {
  return availabilityStartsAt(
    availability.available_date,
    availability.start_minute,
  ) > now;
}

function defaultStartMinute(date: string, now: Date): number | null {
  if (date < hongKongToday()) {
    return null;
  }
  if (date > hongKongToday()) {
    return DEFAULT_START_MINUTE;
  }
  const hour = Number(formatInTimeZone(now, TIMEZONE, "H"));
  const minute = Number(formatInTimeZone(now, TIMEZONE, "m"));
  const nextSlot = (Math.floor((hour * 60 + minute) / 30) + 1) * 30;
  return nextSlot < MINUTES_PER_DAY ? nextSlot : null;
}

export default async function CoachShiftPage({ searchParams }: Props) {
  const coach = await requireCoach();
  const params = await searchParams;
  const week = parseAvailabilityWeekParam(params.week);
  const weekStarts = availabilityWeekStarts();
  const days = availabilityWeekDays(week);
  const weekEnd = days[6];
  const now = new Date();
  const supabase = await createClient();
  const { data: availabilities, error } = await supabase
    .from("staff_availabilities")
    .select(
      "id, coach_id, available_date, start_minute, end_minute, created_at, updated_at",
    )
    .eq("coach_id", coach.id)
    .gte("available_date", week)
    .lte("available_date", weekEnd)
    .order("available_date")
    .order("start_minute");

  if (error) {
    console.error("[CoachShiftPage] load availability", {
      error,
      coachId: coach.id,
      week,
    });
  }

  const byDate = new Map<string, StaffAvailability[]>();
  for (const availability of (availabilities ?? []) as StaffAvailability[]) {
    const rows = byDate.get(availability.available_date) ?? [];
    rows.push(availability);
    byDate.set(availability.available_date, rows);
  }

  return (
    <div className="space-y-6">
      <Panel title="提交可返工時間">
        <p className="text-sm text-stone-500">
          選擇指定日期及時段，每次新增、修改或刪除都會即時儲存。時間以
          30 分鐘為單位。
        </p>
        <div className="flex flex-wrap gap-2">
          {weekStarts.map((weekStart, index) => (
            <Link
              key={weekStart}
              href={`/coach/shift?week=${weekStart}`}
              className={`rounded-md px-3 py-2 text-sm ${
                weekStart === week
                  ? "bg-stone-900 text-white"
                  : "border border-stone-200 bg-white text-stone-700"
              }`}
            >
              {index === 0 ? "本週" : `第 ${index + 1} 週`} · {weekStart.slice(5)}
            </Link>
          ))}
        </div>
        <p className="text-sm font-medium">
          {week} – {weekEnd}
        </p>
      </Panel>

      {error ? (
        <Panel title="未能載入">
          <p className="text-sm text-red-700">
            無法讀取可返工時間，請稍後再試。
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {days.map((date, dayIndex) => {
            const dayAvailabilities = byDate.get(date) ?? [];
            const suggestedStart = defaultStartMinute(date, now);
            return (
              <Panel
                key={date}
                title={`星期${WEEKDAY_LABELS[dayIndex]} · ${date}`}
              >
                <div className="space-y-3">
                  {dayAvailabilities.map((availability) => {
                    const editable = canEditAvailability(availability, now);
                    if (!editable) {
                      return (
                        <div
                          key={availability.id}
                          className="rounded-md bg-stone-100 px-3 py-2 text-sm"
                        >
                          <p className="font-medium">
                            {formatAvailabilityTime(
                              availability.start_minute,
                            )}
                            {" – "}
                            {formatAvailabilityTime(availability.end_minute)}
                          </p>
                          <p className="text-xs text-stone-500">
                            已開始，不能修改
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={availability.id}
                        className="space-y-2 rounded-md border border-stone-200 p-3"
                      >
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
                          <SubmitButton>儲存修改</SubmitButton>
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
                    );
                  })}
                  {dayAvailabilities.length === 0 ? (
                    <p className="text-sm text-stone-500">尚未提交時段</p>
                  ) : null}
                </div>

                {suggestedStart != null ? (
                  <ActionForm
                    action={saveAvailabilityAction}
                    className="space-y-3 border-t border-stone-100 pt-4"
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
                    <SubmitButton>新增時段</SubmitButton>
                  </ActionForm>
                ) : null}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
