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
import { ExpectedPaySummary, formatExpectedPay } from "@/components/expected-pay-summary";
import { PayMethodDetails } from "@/components/pay-method-details";
import {
  durationMinutes,
  expectedHourlyAmount,
  hourlyRateOrNull,
} from "@/lib/expected-pay";
import { DataValue, EmphasizedText } from "@/components/data-value";
import { formatDateTime, formatMoney, nestedStudentName } from "@/lib/format";
import { describePayFormula, payRatioPercentLabel } from "@/lib/pay-formula";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ coachId: string }>;
  searchParams: Promise<{ month?: string }>;
};

function hoursBetween(startsAt: string, endsAt: string): number {
  return (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000;
}

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
  const [{ data: coach }, { data: lessons }, { data: lessonTypes }, { data: rates }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, hourly_rate_hkd, pay_ratio")
        .eq("id", coachId)
        .eq("role", "coach")
        .eq("active", true)
        .maybeSingle(),
      supabase
        .from("lessons")
        .select(
          "id, lesson_type_id, starts_at, ends_at, status, earned_amount_hkd, student_fee_hkd",
        )
        .eq("coach_id", coachId)
        .in("status", ["completed", "assigned"])
        .gte("starts_at", start)
        .lt("starts_at", end)
        .order("starts_at", { ascending: true }),
      supabase.from("lesson_types").select("id, name, pay_mode"),
      supabase
        .from("coach_rates")
        .select("lesson_type_id, amount_hkd")
        .eq("coach_id", coachId),
    ]);

  if (!coach) {
    notFound();
  }

  const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
  const { data: lessonStudents } = lessonIds.length
    ? await supabase
        .from("lesson_students")
        .select("lesson_id, students(name)")
        .in("lesson_id", lessonIds)
    : { data: [] };

  const studentByLesson = new Map<string, string>();
  const studentCountByLesson = new Map<string, number>();
  for (const row of lessonStudents ?? []) {
    const name = nestedStudentName(row);
    if (name) {
      studentByLesson.set(row.lesson_id, name);
    }
    studentCountByLesson.set(
      row.lesson_id,
      (studentCountByLesson.get(row.lesson_id) ?? 0) + 1,
    );
  }

  const hourlyRate = hourlyRateOrNull(coach.hourly_rate_hkd);
  const payRatio = hourlyRateOrNull(coach.pay_ratio);
  const rateByType = new Map(
    (rates ?? []).map((row) => [
      row.lesson_type_id,
      hourlyRateOrNull(row.amount_hkd),
    ]),
  );
  const assignedLessons = (lessons ?? []).filter(
    (lesson) => lesson.status === "assigned",
  );
  const confirmedLessons = (lessons ?? []).filter(
    (lesson) => lesson.status === "completed",
  );
  const expected =
    hourlyRate == null
      ? null
      : Math.round(
          assignedLessons.reduce(
            (sum, lesson) =>
              sum +
              expectedHourlyAmount(
                durationMinutes(lesson.starts_at, lesson.ends_at),
                hourlyRate,
              ),
            0,
          ) * 100,
        ) / 100;

  const typeById = new Map((lessonTypes ?? []).map((type) => [type.id, type]));
  const lessonsByType = new Map<string, typeof confirmedLessons>();
  for (const lesson of confirmedLessons) {
    const group = lessonsByType.get(lesson.lesson_type_id) ?? [];
    group.push(lesson);
    lessonsByType.set(lesson.lesson_type_id, group);
  }
  const wageGroups = [...lessonsByType.entries()]
    .map(([typeId, items]) => ({
      typeId,
      name: typeById.get(typeId)?.name ?? "工作",
      payMode: typeById.get(typeId)?.pay_mode ?? null,
      items,
      total: items.reduce(
        (sum, lesson) => sum + Number(lesson.earned_amount_hkd ?? 0),
        0,
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  const total = wageGroups.reduce((sum, group) => sum + group.total, 0);

  const prev = shiftMonth(period, -1);
  const next = shiftMonth(period, 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#2C2C2C]">薪資</h1>
        <p className="mt-1 text-sm text-[#525252]">
          {coach.full_name} ·{" "}
          <EmphasizedText
            figure
            text={`${period} 結算期（${payrollPeriodLabel(period)}）`}
          />
        </p>
      </div>
      <Panel title="本結算期">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href={`/employer/salary/${coachId}?month=${prev}`}
            className="text-sm text-stone-600 underline"
          >
            上期
          </Link>
          <ExpectedPaySummary
            confirmed={total}
            expected={expected}
            tour="employer-salary-detail"
          />
          <Link
            href={`/employer/salary/${coachId}?month=${next}`}
            className="text-sm text-stone-600 underline"
          >
            下期
          </Link>
        </div>
        <PayMethodDetails>
          {payRatioPercentLabel(payRatio) ? (
            <p>分成：{payRatioPercentLabel(payRatio)}</p>
          ) : null}
          <p>
            <Link href="/employer/coaches" className="underline">
              修改此同事的工種費率
            </Link>
          </p>
        </PayMethodDetails>
        <section className="mb-4">
          <h3 className="text-sm font-semibold text-stone-800">
            已派更，待簽到 · {formatExpectedPay(expected)}
          </h3>
          <p className="text-xs text-stone-500">時薪估計；PT／MIIT 簽到後才計入已確認</p>
          {assignedLessons.length === 0 ? (
            <p className="py-2 text-sm text-stone-500">此結算期尚無未簽到派更</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {assignedLessons.map((lesson) => (
                <li key={lesson.id} className="flex justify-between gap-3 py-2">
                  <p className="text-sm text-stone-700">
                    <EmphasizedText
                      figure
                      text={`${formatDateTime(lesson.starts_at)}${
                        hourlyRate == null
                          ? ""
                          : ` · ${(durationMinutes(lesson.starts_at, lesson.ends_at) / 60).toFixed(1)} 小時`
                      }`}
                    />
                  </p>
                  <p>
                    {hourlyRate == null ? (
                      "未設定時薪"
                    ) : (
                      <DataValue figure>
                        {formatMoney(
                          expectedHourlyAmount(
                            durationMinutes(lesson.starts_at, lesson.ends_at),
                            hourlyRate,
                          ),
                        )}
                      </DataValue>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="mb-3 text-sm">
          <Link
            href={`/employer/salary?month=${period}`}
            className="text-stone-600 underline"
          >
            ← 全部薪資
          </Link>
        </p>
        {wageGroups.length === 0 ? (
          <p className="py-3 text-sm text-stone-500">此結算期尚無已簽到工作</p>
        ) : (
          wageGroups.map((group) => {
            const typeRate = rateByType.get(group.typeId) ?? null;
            const rateLabel =
              group.payMode === "per_head" && typeRate != null
                ? `每人 ${formatMoney(typeRate)}`
                : group.payMode === "per_hour" && typeRate != null
                  ? `時薪 ${formatMoney(typeRate)}`
                  : group.payMode === "per_hour" && hourlyRate != null
                    ? `時薪 ${formatMoney(hourlyRate)}`
                    : null;
            return (
            <section key={group.typeId} className="mt-4">
              <div className="flex items-baseline justify-between gap-3 border-b border-stone-200 pb-1">
                <div>
                  <h3 className="text-sm font-semibold text-stone-800">
                    {group.name}
                  </h3>
                  {rateLabel ? (
                    <p className="text-xs text-stone-500">
                      {rateLabel}
                      {" · "}
                      <Link href="/employer/coaches" className="underline">
                        改費率
                      </Link>
                    </p>
                  ) : null}
                </div>
                <DataValue figure>{formatMoney(group.total)}</DataValue>
              </div>
              <ul className="divide-y divide-stone-100">
                {group.items.map((lesson) => {
                  const studentName = studentByLesson.get(lesson.id);
                  const formula = describePayFormula({
                    payMode: group.payMode,
                    studentCount: studentCountByLesson.get(lesson.id) ?? 0,
                    unitRate:
                      group.payMode === "per_head" || group.payMode === "per_hour"
                        ? (typeRate ?? hourlyRate)
                        : null,
                    payRatio,
                    minutes: durationMinutes(lesson.starts_at, lesson.ends_at),
                  });
                  return (
                    <li
                      key={lesson.id}
                      className="flex justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="text-sm text-stone-700">
                          <EmphasizedText figure text={formatDateTime(lesson.starts_at)} />
                        </p>
                        {group.payMode === "per_hour" ? (
                          <p className="text-sm text-stone-700">
                            <DataValue>
                              {hoursBetween(lesson.starts_at, lesson.ends_at).toFixed(1)} 小時
                            </DataValue>
                          </p>
                        ) : null}
                        {group.payMode === "per_student" ? (
                          <p className="text-sm text-stone-500">
                            學生：{studentName ?? "—"}
                            {lesson.student_fee_hkd == null ? (
                              ""
                            ) : (
                              <>
                                {" · 學費 "}
                                <DataValue>
                                  {formatMoney(Number(lesson.student_fee_hkd))}
                                </DataValue>
                              </>
                            )}
                          </p>
                        ) : null}
                        {group.payMode === "per_head" ? (
                          <p className="text-sm text-stone-500">
                            學生 {studentCountByLesson.get(lesson.id) ?? 0} 人
                          </p>
                        ) : null}
                        <p className="text-xs text-stone-500">{formula.line}</p>
                      </div>
                      <DataValue figure>
                        {formatMoney(Number(lesson.earned_amount_hkd ?? 0))}
                      </DataValue>
                    </li>
                  );
                })}
              </ul>
            </section>
            );
          })
        )}
      </Panel>
    </div>
  );
}
