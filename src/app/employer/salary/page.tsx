import Link from "next/link";
import { Panel } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import {
  parsePayrollPeriodParam,
  payrollPeriodBoundsIso,
  payrollPeriodLabel,
  shiftMonth,
} from "@/lib/calendar";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ month?: string }>;
};

export default async function EmployerSalaryPage({ searchParams }: Props) {
  await requireEmployer();
  const params = await searchParams;
  const period = parsePayrollPeriodParam(params.month);
  const { start, end } = payrollPeriodBoundsIso(period);

  const supabase = await createClient();
  const [{ data: coaches }, { data: lessons }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "coach")
      .order("full_name"),
    supabase
      .from("lessons")
      .select("coach_id, earned_amount_hkd")
      .eq("status", "completed")
      .gte("starts_at", start)
      .lt("starts_at", end)
      .not("coach_id", "is", null),
  ]);

  const totals = new Map<string, number>();
  for (const lesson of lessons ?? []) {
    if (!lesson.coach_id) continue;
    totals.set(
      lesson.coach_id,
      (totals.get(lesson.coach_id) ?? 0) + Number(lesson.earned_amount_hkd ?? 0),
    );
  }

  const grandTotal = [...totals.values()].reduce((sum, n) => sum + n, 0);
  const prev = shiftMonth(period, -1);
  const next = shiftMonth(period, 1);

  return (
    <div className="space-y-6">
      <Panel title={`薪資 · ${period} 結算期`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href={`/employer/salary?month=${prev}`}
            className="text-sm text-stone-600 underline"
          >
            上期
          </Link>
          <p className="text-lg font-semibold">{formatMoney(grandTotal)}</p>
          <Link
            href={`/employer/salary?month=${next}`}
            className="text-sm text-stone-600 underline"
          >
            下期
          </Link>
        </div>
        <p className="mb-3 text-sm text-stone-500">
          結算期：{payrollPeriodLabel(period)} · 僅計算已完成課堂；金額於登記時凍結。
        </p>
        <ul className="divide-y divide-stone-100">
          {(coaches ?? []).map((coach) => {
            const total = totals.get(coach.id) ?? 0;
            return (
              <li key={coach.id} className="flex justify-between gap-3 py-3">
                <div>
                  <Link
                    href={`/employer/salary/${coach.id}?month=${period}`}
                    className="font-medium underline"
                  >
                    {coach.full_name}
                  </Link>
                </div>
                <p className="text-sm font-medium">{formatMoney(total)}</p>
              </li>
            );
          })}
          {(coaches ?? []).length === 0 ? (
            <li className="py-3 text-sm text-stone-500">尚未新增教練</li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
