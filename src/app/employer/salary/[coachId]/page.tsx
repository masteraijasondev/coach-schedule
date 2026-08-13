import Link from "next/link";
import { notFound } from "next/navigation";
import { Panel } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import {
  parsePayrollPeriodParam,
  payrollPeriodBoundsIso,
  payrollPeriodLabel,
  shiftMonth,
} from "@/lib/calendar";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ coachId: string }>;
  searchParams: Promise<{ month?: string }>;
};

export default async function EmployerCoachSalaryPage({
  params,
  searchParams,
}: Props) {
  await requireEmployer();
  const { coachId } = await params;
  const query = await searchParams;
  const period = parsePayrollPeriodParam(query.month);
  const { start, end } = payrollPeriodBoundsIso(period);

  const supabase = await createClient();
  const [{ data: coach }, { data: lessons }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", coachId)
      .eq("role", "coach")
      .maybeSingle(),
    supabase
      .from("lessons")
      .select("id, lesson_type_id, starts_at, earned_amount_hkd")
      .eq("coach_id", coachId)
      .eq("status", "completed")
      .gte("starts_at", start)
      .lt("starts_at", end)
      .order("starts_at", { ascending: true }),
  ]);

  if (!coach) {
    notFound();
  }

  const typeIds = [...new Set((lessons ?? []).map((l) => l.lesson_type_id))];
  const { data: types } = typeIds.length
    ? await supabase.from("lesson_types").select("id, name").in("id", typeIds)
    : { data: [] };
  const typeMap = new Map((types ?? []).map((t) => [t.id, t.name]));

  const total = (lessons ?? []).reduce(
    (sum, lesson) => sum + Number(lesson.earned_amount_hkd ?? 0),
    0,
  );

  const prev = shiftMonth(period, -1);
  const next = shiftMonth(period, 1);

  return (
    <div className="space-y-6">
      <Panel title={`薪資 · ${coach.full_name} · ${period} 結算期`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href={`/employer/salary/${coachId}?month=${prev}`}
            className="text-sm text-stone-600 underline"
          >
            上期
          </Link>
          <p className="text-lg font-semibold">{formatMoney(total)}</p>
          <Link
            href={`/employer/salary/${coachId}?month=${next}`}
            className="text-sm text-stone-600 underline"
          >
            下期
          </Link>
        </div>
        <p className="mb-3 text-sm text-stone-500">
          結算期：{payrollPeriodLabel(period)} · 僅計算已完成課堂；金額於登記時凍結。
        </p>
        <p className="mb-3 text-sm">
          <Link
            href={`/employer/salary?month=${period}`}
            className="text-stone-600 underline"
          >
            ← 全部教練
          </Link>
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
            <li className="py-3 text-sm text-stone-500">
              此結算期尚無已完成課堂
            </li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
