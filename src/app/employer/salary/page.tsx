import Link from "next/link";
import { Panel } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import {
  parsePayrollPeriodParam,
  payrollPeriodBoundsIso,
  payrollPeriodLabel,
  lessonDayKey,
  payrollPeriodForDate,
  shiftMonth,
} from "@/lib/calendar";
import { ExpectedPaySummary } from "@/components/expected-pay-summary";
import {
  hourlyRateOrNull,
  periodPayTotals,
  type PayShift,
} from "@/lib/expected-pay";
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
  const [{ data: coaches }, { data: lessons }, { data: lessonTypes }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, hourly_rate_hkd")
        .eq("role", "coach")
        .eq("active", true)
        .order("full_name"),
      supabase
        .from("lessons")
        .select("coach_id, lesson_type_id, earned_amount_hkd, starts_at, ends_at, status")
        .in("status", ["completed", "assigned"])
        .gte("starts_at", start)
        .lt("starts_at", end)
        .not("coach_id", "is", null),
      supabase.from("lesson_types").select("id, name"),
    ]);

  const typeName = new Map((lessonTypes ?? []).map((type) => [type.id, type.name]));
  const wagesByCoach = new Map<string, Map<string, number>>();
  const shiftsByCoach = new Map<string, PayShift[]>();
  for (const lesson of lessons ?? []) {
    if (!lesson.coach_id) continue;
    if (
      lesson.status === "completed" &&
      payrollPeriodForDate(lessonDayKey(lesson.starts_at)) === period
    ) {
      const byType = wagesByCoach.get(lesson.coach_id) ?? new Map<string, number>();
      const typeId = lesson.lesson_type_id;
      byType.set(typeId, (byType.get(typeId) ?? 0) + Number(lesson.earned_amount_hkd ?? 0));
      wagesByCoach.set(lesson.coach_id, byType);
    }
    const shifts = shiftsByCoach.get(lesson.coach_id) ?? [];
    if (lesson.status === "assigned" || lesson.status === "completed") {
      shifts.push({
        coachId: lesson.coach_id,
        startsAt: lesson.starts_at,
        endsAt: lesson.ends_at,
        status: lesson.status,
        earnedAmountHkd:
          lesson.earned_amount_hkd == null
            ? null
            : Number(lesson.earned_amount_hkd),
      });
      shiftsByCoach.set(lesson.coach_id, shifts);
    }
  }

  const activeCoachIds = new Set((coaches ?? []).map((person) => person.id));
  const grandTotal = [...wagesByCoach.entries()].reduce((sum, [coachId, byType]) => {
    if (!activeCoachIds.has(coachId)) {
      return sum;
    }
    return sum + [...byType.values()].reduce((typeSum, amount) => typeSum + amount, 0);
  }, 0);
  const expectedByCoach = new Map(
    (coaches ?? []).map((person) => [
      person.id,
      periodPayTotals(
        shiftsByCoach.get(person.id) ?? [],
        hourlyRateOrNull(person.hourly_rate_hkd),
        period,
      ).expected,
    ]),
  );
  const grandExpectedValues = [...expectedByCoach.values()].filter(
    (amount): amount is number => amount != null,
  );
  const grandExpected =
    grandExpectedValues.length === 0
      ? null
      : Math.round(
          grandExpectedValues.reduce((sum, amount) => sum + amount, 0) * 100,
        ) / 100;
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
          <ExpectedPaySummary confirmed={grandTotal} expected={grandExpected} />
          <Link
            href={`/employer/salary?month=${next}`}
            className="text-sm text-stone-600 underline"
          >
            下期
          </Link>
        </div>
        <p className="mb-3 text-sm text-stone-500">
          結算期：{payrollPeriodLabel(period)}。已確認薪金只計已簽到。預期薪金只計尚未簽到的已派更時段，按時薪估計；學生分成要簽到後先計入已確認薪金。
        </p>
        <ul className="divide-y divide-stone-100">
          {(coaches ?? []).map((person) => {
            const byType = wagesByCoach.get(person.id) ?? new Map<string, number>();
            const lines = [...byType.entries()]
              .map(([typeId, amount]) => ({
                typeId,
                name: typeName.get(typeId) ?? "工作",
                amount,
              }))
              .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
            const total = lines.reduce((sum, line) => sum + line.amount, 0);
            return (
              <li key={person.id} className="py-3">
                <div className="flex justify-between gap-3">
                  <Link
                    href={`/employer/salary/${person.id}?month=${period}`}
                    className="font-medium underline"
                  >
                    {person.full_name}
                  </Link>
                  <ExpectedPaySummary
                    compact
                    confirmed={total}
                    expected={expectedByCoach.get(person.id) ?? null}
                  />
                </div>
                {lines.length === 0 ? (
                  <p className="mt-1 text-xs text-stone-500">此結算期尚無已簽到工作</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {lines.map((line) => (
                      <li
                        key={line.typeId}
                        className="flex justify-between gap-3 text-sm text-stone-600"
                      >
                        <span>{line.name}</span>
                        <span>{formatMoney(line.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {(coaches ?? []).length === 0 ? (
            <li className="py-3 text-sm text-stone-500">沒有帳號</li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
