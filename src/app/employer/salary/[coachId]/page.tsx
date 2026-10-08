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
import {
  durationMinutes,
  expectedHourlyAmount,
  hourlyRateOrNull,
} from "@/lib/expected-pay";
import { formatDateTime, formatMoney, nestedStudentName } from "@/lib/format";
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
  const [{ data: coach }, { data: lessons }, { data: lessonTypes }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, hourly_rate_hkd")
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
  for (const row of lessonStudents ?? []) {
    const name = nestedStudentName(row);
    if (name) {
      studentByLesson.set(row.lesson_id, name);
    }
  }

  const hourlyRate = hourlyRateOrNull(coach.hourly_rate_hkd);
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
      <Panel title={`薪資 · ${coach.full_name} · ${period} 結算期`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href={`/employer/salary/${coachId}?month=${prev}`}
            className="text-sm text-stone-600 underline"
          >
            上期
          </Link>
          <ExpectedPaySummary confirmed={total} expected={expected} />
          <Link
            href={`/employer/salary/${coachId}?month=${next}`}
            className="text-sm text-stone-600 underline"
          >
            下期
          </Link>
        </div>
        <p className="mb-3 text-sm text-stone-500">
          結算期：{payrollPeriodLabel(period)}。已確認薪金按工作類型分開計算。預期薪金按尚未簽到的已派更時段 × 時薪估計。
        </p>
        <section className="mb-4">
          <h3 className="text-sm font-semibold text-stone-800">
            已派更，待簽到 · {formatExpectedPay(expected)}
          </h3>
          {assignedLessons.length === 0 ? (
            <p className="py-2 text-sm text-stone-500">此結算期尚無未簽到派更</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {assignedLessons.map((lesson) => (
                <li key={lesson.id} className="flex justify-between gap-3 py-2">
                  <p className="text-sm tabular-nums text-stone-700">
                    {formatDateTime(lesson.starts_at)}
                    {hourlyRate == null
                      ? ""
                      : ` · ${(durationMinutes(lesson.starts_at, lesson.ends_at) / 60).toFixed(1)} 小時`}
                  </p>
                  <p className="text-sm font-medium">
                    {hourlyRate == null
                      ? "未設定時薪"
                      : formatMoney(
                          expectedHourlyAmount(
                            durationMinutes(lesson.starts_at, lesson.ends_at),
                            hourlyRate,
                          ),
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
          wageGroups.map((group) => (
            <section key={group.typeId} className="mt-4">
              <div className="flex items-baseline justify-between gap-3 border-b border-stone-200 pb-1">
                <h3 className="text-sm font-semibold text-stone-800">
                  {group.name}
                </h3>
                <p className="text-sm font-medium">{formatMoney(group.total)}</p>
              </div>
              <ul className="divide-y divide-stone-100">
                {group.items.map((lesson) => {
                  const studentName = studentByLesson.get(lesson.id);
                  return (
                    <li
                      key={lesson.id}
                      className="flex justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="text-sm tabular-nums text-stone-700">
                          {formatDateTime(lesson.starts_at)}
                        </p>
                        {group.payMode === "per_hour" ? (
                          <p className="text-sm text-stone-500">
                            {hoursBetween(lesson.starts_at, lesson.ends_at).toFixed(1)}{" "}
                            小時
                          </p>
                        ) : null}
                        {group.payMode === "per_student" ? (
                          <p className="text-sm text-stone-500">
                            學生：{studentName ?? "—"}
                            {lesson.student_fee_hkd == null
                              ? ""
                              : ` · 學費 ${formatMoney(Number(lesson.student_fee_hkd))}`}
                          </p>
                        ) : null}
                      </div>
                      <p className="text-sm font-medium">
                        {formatMoney(Number(lesson.earned_amount_hkd ?? 0))}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </Panel>
    </div>
  );
}
