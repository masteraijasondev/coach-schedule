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
import { formatPayRatioPercent } from "@/lib/pt-rate";
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
      .select("id, full_name, staff_kind, hourly_rate_hkd, pay_ratio")
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
          結算期：{payrollPeriodLabel(period)}。Admin 按時薪乘工時；Coach 按學生學費乘分成比例。
        </p>
        {(["operations", "coach"] as const).map((kind) => {
          const people = (coaches ?? []).filter((person) =>
            kind === "operations"
              ? person.staff_kind === "operations"
              : person.staff_kind !== "operations",
          );
          return (
            <section key={kind} className="mb-6">
              <h3 className="mb-1 text-sm font-semibold text-stone-800">
                {kind === "operations" ? "Admin · Hourly Rate" : "Coach · Ratio"}
              </h3>
              <ul className="divide-y divide-stone-100">
                {people.map((person) => {
                  const total = totals.get(person.id) ?? 0;
                  const rateLabel =
                    kind === "operations"
                      ? person.hourly_rate_hkd == null
                        ? "未設定時薪"
                        : `${formatMoney(Number(person.hourly_rate_hkd))}/小時`
                      : person.pay_ratio == null
                        ? "未設定分成"
                        : `${formatPayRatioPercent(Number(person.pay_ratio))}%`;
                  return (
                    <li key={person.id} className="flex justify-between gap-3 py-3">
                      <div>
                        <Link
                          href={`/employer/salary/${person.id}?month=${period}`}
                          className="font-medium underline"
                        >
                          {person.full_name}
                        </Link>
                        <p className="text-xs text-stone-500">{rateLabel}</p>
                      </div>
                      <p className="text-sm font-medium">{formatMoney(total)}</p>
                    </li>
                  );
                })}
                {people.length === 0 ? (
                  <li className="py-3 text-sm text-stone-500">沒有帳號</li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </Panel>
    </div>
  );
}
