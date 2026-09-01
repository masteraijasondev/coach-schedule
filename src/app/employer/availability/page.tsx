import { Panel } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import {
  availabilityWeekDays,
  availabilityWeekStarts,
  parseAvailabilityWeekParam,
} from "@/lib/calendar";
import { formatAvailabilityTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { StaffAvailability } from "@/lib/types";
import Link from "next/link";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

type Props = {
  searchParams: Promise<{ week?: string }>;
};

export default async function EmployerAvailabilityPage({
  searchParams,
}: Props) {
  await requireEmployer();
  const params = await searchParams;
  const week = parseAvailabilityWeekParam(params.week);
  const weekStarts = availabilityWeekStarts();
  const days = availabilityWeekDays(week);
  const weekEnd = days[6];
  const supabase = await createClient();

  const [{ data: coaches, error: coachesError }, { data, error }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "coach")
        .order("full_name"),
      supabase
        .from("staff_availabilities")
        .select(
          "id, coach_id, available_date, start_minute, end_minute, created_at, updated_at",
        )
        .gte("available_date", week)
        .lte("available_date", weekEnd)
        .order("start_minute"),
    ]);

  if (coachesError || error) {
    console.error("[EmployerAvailabilityPage] load availability", {
      coachesError,
      availabilityError: error,
      week,
    });
  }

  const byCoachAndDate = new Map<string, StaffAvailability[]>();
  for (const availability of (data ?? []) as StaffAvailability[]) {
    const key = `${availability.coach_id}:${availability.available_date}`;
    const rows = byCoachAndDate.get(key) ?? [];
    rows.push(availability);
    byCoachAndDate.set(key, rows);
  }

  return (
    <div className="space-y-6">
      <Panel title="員工可返工時間">
        <p className="text-sm text-stone-500">
          顯示員工自行提交的 availability；此頁只供查看，不代表已正式排更。
        </p>
        <div className="flex flex-wrap gap-2">
          {weekStarts.map((weekStart, index) => (
            <Link
              key={weekStart}
              href={`/employer/availability?week=${weekStart}`}
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

      {coachesError || error ? (
        <Panel title="未能載入">
          <p className="text-sm text-red-700">
            無法讀取員工可返工時間，請稍後再試。
          </p>
        </Panel>
      ) : (
        <Panel title="每週 availability">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-stone-600">
                  <th className="w-32 px-2 py-3 font-medium">員工</th>
                  {days.map((date, index) => (
                    <th key={date} className="px-2 py-3 font-medium">
                      星期{WEEKDAY_LABELS[index]}
                      <span className="block text-xs font-normal text-stone-400">
                        {date.slice(5)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {(coaches ?? []).map((coach) => (
                  <tr key={coach.id} className="align-top">
                    <th className="px-2 py-3 text-left font-medium">
                      {coach.full_name}
                    </th>
                    {days.map((date) => {
                      const rows =
                        byCoachAndDate.get(`${coach.id}:${date}`) ?? [];
                      return (
                        <td key={date} className="px-2 py-3">
                          <div className="space-y-1.5">
                            {rows.map((availability) => (
                              <div
                                key={availability.id}
                                className="rounded-md bg-sky-100 px-2 py-1.5 font-medium text-sky-900"
                              >
                                {formatAvailabilityTime(
                                  availability.start_minute,
                                )}
                                {"–"}
                                {formatAvailabilityTime(
                                  availability.end_minute,
                                )}
                              </div>
                            ))}
                            {rows.length === 0 ? (
                              <span className="text-stone-300">—</span>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(coaches ?? []).length === 0 ? (
            <p className="text-sm text-stone-500">尚未有教練帳戶</p>
          ) : null}
        </Panel>
      )}
    </div>
  );
}
