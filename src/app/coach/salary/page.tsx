import Link from "next/link";
import { Panel } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import {
  parsePayrollPeriodParam,
  payrollPeriodBoundsIso,
  payrollPeriodLabel,
  shiftMonth,
} from "@/lib/calendar";
import { formatDateTime, formatLessonSizeLabel, formatMoney, formatMoneyOrPending } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ month?: string }>;
};

export default async function CoachSalaryPage({ searchParams }: Props) {
  const coach = await requireCoach();
  const params = await searchParams;
  const period = parsePayrollPeriodParam(params.month);
  const { start, end } = payrollPeriodBoundsIso(period);

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
    ? await supabase.from("lesson_types").select("id, name, pay_mode").in("id", typeIds)
    : { data: [] };
  const typeMap = new Map((types ?? []).map((t) => [t.id, t.name]));
  const payModeByType = new Map((types ?? []).map((t) => [t.id, t.pay_mode]));

  const total = (lessons ?? []).reduce(
    (sum, lesson) => sum + Number(lesson.earned_amount_hkd ?? 0),
    0,
  );

  const prev = shiftMonth(period, -1);
  const next = shiftMonth(period, 1);

  return (
    <div className="space-y-6">
      <Panel title={`薪資 · ${period} 結算期`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href={`/coach/salary?month=${prev}`}
            className="text-sm text-stone-600 underline"
          >
            上期
          </Link>
          <p className="text-lg font-semibold">{formatMoney(total)}</p>
          <Link
            href={`/coach/salary?month=${next}`}
            className="text-sm text-stone-600 underline"
          >
            下期
          </Link>
        </div>
        <p className="mb-3 text-sm text-stone-500">
          結算期：{payrollPeriodLabel(period)} · 僅計算已確認課堂；未填金額暫不計入總額。
        </p>
        <ul className="divide-y divide-stone-100">
          {(lessons ?? []).map((lesson) => {
            const sizeLabel = formatLessonSizeLabel(
              payModeByType.get(lesson.lesson_type_id),
              lesson.headcount,
              lesson.expected_headcount,
            );
            return (
            <li key={lesson.id} className="flex justify-between gap-3 py-3">
              <div>
                <p className="font-medium">
                  {typeMap.get(lesson.lesson_type_id) ?? "課堂"}
                </p>
                <p className="text-sm text-stone-500">
                  {formatDateTime(lesson.starts_at)}
                </p>
                {sizeLabel ? (
                  <p className="text-sm text-stone-500">{sizeLabel}</p>
                ) : null}
              </div>
              <p
                className={
                  lesson.earned_amount_hkd == null
                    ? "text-sm font-medium text-amber-700"
                    : "text-sm font-medium"
                }
              >
                {formatMoneyOrPending(lesson.earned_amount_hkd)}
              </p>
            </li>
            );
          })}
          {(lessons ?? []).length === 0 ? (
            <li className="py-3 text-sm text-stone-500">此結算期尚無已完成課堂</li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
