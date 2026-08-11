import Link from "next/link";
import { Panel } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { TIMEZONE } from "@/lib/constants";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

type Props = {
  searchParams: Promise<{ month?: string }>;
};

function monthBounds(month: string): { start: string; end: string; label: string } {
  const startLocal = fromZonedTime(`${month}-01T00:00:00`, TIMEZONE);
  const [y, m] = month.split("-").map(Number);
  const nextMonth =
    m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const endLocal = fromZonedTime(`${nextMonth}-01T00:00:00`, TIMEZONE);
  return {
    start: startLocal.toISOString(),
    end: endLocal.toISOString(),
    label: month,
  };
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export default async function CoachSalaryPage({ searchParams }: Props) {
  const coach = await requireCoach();
  const params = await searchParams;
  const currentMonth = formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM");
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : currentMonth;
  const { start, end } = monthBounds(month);

  const supabase = await createClient();
  const { data: lessons } = await supabase
    .from("lessons")
    .select("*")
    .eq("coach_id", coach.id)
    .eq("status", "completed")
    .gte("starts_at", start)
    .lt("starts_at", end)
    .order("starts_at", { ascending: true });

  const typeIds = [...new Set((lessons ?? []).map((l) => l.lesson_type_id))];
  const { data: types } = typeIds.length
    ? await supabase.from("lesson_types").select("id, name").in("id", typeIds)
    : { data: [] };
  const typeMap = new Map((types ?? []).map((t) => [t.id, t.name]));

  const total = (lessons ?? []).reduce(
    (sum, lesson) => sum + Number(lesson.earned_amount_hkd ?? 0),
    0,
  );

  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="space-y-6">
      <Panel title={`薪資 · ${month}`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href={`/coach/salary?month=${prev}`}
            className="text-sm text-stone-600 underline"
          >
            上月
          </Link>
          <p className="text-lg font-semibold">{formatMoney(total)}</p>
          <Link
            href={`/coach/salary?month=${next}`}
            className="text-sm text-stone-600 underline"
          >
            下月
          </Link>
        </div>
        <p className="mb-3 text-sm text-stone-500">
          僅計算已完成課堂；金額於完成時凍結。
        </p>
        <ul className="divide-y divide-stone-100">
          {(lessons ?? []).map((lesson) => (
            <li key={lesson.id} className="flex justify-between gap-3 py-3">
              <div>
                <p className="font-medium">
                  {typeMap.get(lesson.lesson_type_id) ?? "課堂"}
                </p>
                <p className="text-sm text-stone-500">
                  {formatDateTime(lesson.starts_at)}
                </p>
              </div>
              <p className="text-sm font-medium">
                {formatMoney(Number(lesson.earned_amount_hkd ?? 0))}
              </p>
            </li>
          ))}
          {(lessons ?? []).length === 0 ? (
            <li className="py-3 text-sm text-stone-500">本月尚無已完成課堂</li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
