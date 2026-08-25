import { clockInAction, clockOutAction } from "@/actions/shifts";
import { ServerActionButton } from "@/components/server-action-button";
import { Panel } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { hongKongToday } from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const HISTORY_DAYS = 14;

function historyRangeStartIso(): string {
  const today = hongKongToday();
  const [y, m, d] = today.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d - (HISTORY_DAYS - 1)));
  const ymd = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-${String(start.getUTCDate()).padStart(2, "0")}`;
  return fromZonedTime(`${ymd}T00:00:00`, TIMEZONE).toISOString();
}

function formatDuration(
  clockedInAt: string,
  clockedOutAt: string | null,
): string | null {
  if (!clockedOutAt) {
    return null;
  }
  const minutes = Math.round(
    (new Date(clockedOutAt).getTime() - new Date(clockedInAt).getTime()) /
      60_000,
  );
  if (minutes < 60) {
    return `${minutes} 分鐘`;
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} 小時` : `${hours} 小時 ${rem} 分鐘`;
}

export default async function CoachShiftPage() {
  const coach = await requireCoach();
  const supabase = await createClient();
  const today = hongKongToday();
  const todayStart = fromZonedTime(`${today}T00:00:00`, TIMEZONE).toISOString();
  const historyStart = historyRangeStartIso();

  const [{ data: openShift }, { data: recentShifts }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, coach_id, clocked_in_at, clocked_out_at, created_at")
      .eq("coach_id", coach.id)
      .is("clocked_out_at", null)
      .maybeSingle(),
    supabase
      .from("shifts")
      .select("id, coach_id, clocked_in_at, clocked_out_at, created_at")
      .eq("coach_id", coach.id)
      .gte("clocked_in_at", historyStart)
      .order("clocked_in_at", { ascending: false }),
  ]);

  const todayShifts = (recentShifts ?? []).filter(
    (shift) => shift.clocked_in_at >= todayStart,
  );

  return (
    <div className="space-y-6">
      <Panel title="報更">
        <p className="text-sm text-stone-500">
          到場按「報到」，放工按「下班」。時間以香港時間記錄。
        </p>
        {openShift ? (
          <div className="space-y-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <div>
              <p className="text-sm font-medium text-emerald-900">目前已報到</p>
              <p className="mt-1 text-stone-700">
                報到時間：{formatDateTime(openShift.clocked_in_at)}
              </p>
            </div>
            <ServerActionButton
              action={clockOutAction}
              className="rounded-md bg-stone-900 px-5 py-3 text-base font-medium text-white hover:bg-stone-800 disabled:opacity-60"
            >
              下班
            </ServerActionButton>
          </div>
        ) : (
          <div className="space-y-4 rounded-md border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm text-stone-600">尚未報到</p>
            <ServerActionButton
              action={clockInAction}
              className="rounded-md bg-stone-900 px-5 py-3 text-base font-medium text-white hover:bg-stone-800 disabled:opacity-60"
            >
              報到
            </ServerActionButton>
          </div>
        )}
      </Panel>

      <Panel title={`今日報更 · ${today}`}>
        <ul className="divide-y divide-stone-100">
          {todayShifts.map((shift) => {
            const duration = formatDuration(
              shift.clocked_in_at,
              shift.clocked_out_at,
            );
            return (
              <li key={shift.id} className="py-3 text-sm">
                <p className="font-medium">
                  {formatInTimeZone(shift.clocked_in_at, TIMEZONE, "HH:mm")}
                  {" – "}
                  {shift.clocked_out_at
                    ? formatInTimeZone(shift.clocked_out_at, TIMEZONE, "HH:mm")
                    : "進行中"}
                </p>
                {duration ? (
                  <p className="text-stone-500">時長：{duration}</p>
                ) : null}
              </li>
            );
          })}
          {todayShifts.length === 0 ? (
            <li className="py-3 text-sm text-stone-500">今日尚未有報更紀錄</li>
          ) : null}
        </ul>
      </Panel>

      <Panel title={`近 ${HISTORY_DAYS} 日紀錄`}>
        <ul className="divide-y divide-stone-100">
          {(recentShifts ?? []).map((shift) => {
            const duration = formatDuration(
              shift.clocked_in_at,
              shift.clocked_out_at,
            );
            const day = formatInTimeZone(
              shift.clocked_in_at,
              TIMEZONE,
              "yyyy-MM-dd",
            );
            return (
              <li
                key={shift.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{day}</p>
                  <p className="text-stone-500">
                    {formatInTimeZone(shift.clocked_in_at, TIMEZONE, "HH:mm")}
                    {" – "}
                    {shift.clocked_out_at
                      ? formatInTimeZone(
                          shift.clocked_out_at,
                          TIMEZONE,
                          "HH:mm",
                        )
                      : "進行中"}
                  </p>
                </div>
                {duration ? (
                  <p className="text-stone-500">{duration}</p>
                ) : (
                  <p className="text-emerald-700">進行中</p>
                )}
              </li>
            );
          })}
          {(recentShifts ?? []).length === 0 ? (
            <li className="py-3 text-sm text-stone-500">尚無報更紀錄</li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
