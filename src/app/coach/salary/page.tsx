import Link from "next/link";
import { Panel } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
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
import { formatDateTime, formatLessonSizeLabel, formatMoney, formatMoneyOrPending } from "@/lib/format";
import { relatedStudentName } from "@/lib/employer-calendar-data";
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
  const [{ data: lessons }, { data: profile }] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        "id, lesson_type_id, starts_at, ends_at, status, earned_amount_hkd, headcount, expected_headcount",
      )
      .eq("coach_id", coach.id)
      .in("status", ["completed", "assigned"])
      .gte("starts_at", start)
      .lt("starts_at", end)
      .order("starts_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("hourly_rate_hkd")
      .eq("id", coach.id)
      .maybeSingle(),
  ]);
  const confirmedLessons = (lessons ?? []).filter(
    (lesson) => lesson.status === "completed",
  );
  const assignedLessons = (lessons ?? []).filter(
    (lesson) => lesson.status === "assigned",
  );
  const hourlyRate = hourlyRateOrNull(profile?.hourly_rate_hkd);

  const lessonIds = confirmedLessons.map((lesson) => lesson.id);
  const typeIds = [...new Set(confirmedLessons.map((l) => l.lesson_type_id))];
  const [{ data: types }, { data: lessonStudents }] = await Promise.all([
    typeIds.length
      ? supabase
          .from("lesson_types")
          .select("id, name, pay_mode")
          .in("id", typeIds)
      : Promise.resolve({ data: [] }),
    lessonIds.length
      ? supabase
          .from("lesson_students")
          .select("lesson_id, student_id, students(name)")
          .in("lesson_id", lessonIds)
      : Promise.resolve({ data: [] }),
  ]);
  const typeMap = new Map((types ?? []).map((t) => [t.id, t.name]));
  const payModeByType = new Map((types ?? []).map((t) => [t.id, t.pay_mode]));
  const studentByLesson = new Map<string, string>();
  const studentName = new Map<string, string>();
  for (const row of lessonStudents ?? []) {
    studentByLesson.set(row.lesson_id, row.student_id);
    const name = relatedStudentName(row.students);
    if (name) {
      studentName.set(row.student_id, name);
    }
  }

  const total = confirmedLessons.reduce(
    (sum, lesson) => sum + Number(lesson.earned_amount_hkd ?? 0),
    0,
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
          <ExpectedPaySummary confirmed={total} expected={expected} />
          <Link
            href={`/coach/salary?month=${next}`}
            className="text-sm text-stone-600 underline"
          >
            下期
          </Link>
        </div>
        <p className="mb-3 text-sm text-stone-500">
          結算期：{payrollPeriodLabel(period)}。已確認薪金只計已簽到課堂。預期薪金（{formatExpectedPay(expected)}）按尚未簽到的已派更時段 × 時薪估計，學生分成要簽到後先計入已確認薪金。
        </p>
        {assignedLessons.length > 0 ? (
          <ul className="mb-4 divide-y divide-stone-100 rounded-md border border-dashed border-stone-300">
            {assignedLessons.map((lesson) => (
              <li key={lesson.id} className="flex justify-between gap-3 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">已派更，待簽到</p>
                  <p className="text-sm tabular-nums text-stone-500">
                    {formatDateTime(lesson.starts_at)}
                  </p>
                </div>
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
        ) : null}
        <ul className="divide-y divide-stone-100">
          {confirmedLessons.map((lesson) => {
            const payMode = payModeByType.get(lesson.lesson_type_id);
            const sizeLabel = formatLessonSizeLabel(
              payMode,
              lesson.headcount,
              lesson.expected_headcount,
            );
            const linkedStudentId = studentByLesson.get(lesson.id);
            return (
            <li key={lesson.id} className="flex justify-between gap-3 py-3">
              <div>
                <p className="font-medium">
                  {typeMap.get(lesson.lesson_type_id) ?? "課堂"}
                </p>
                <p className="text-sm tabular-nums text-stone-500">
                  {formatDateTime(lesson.starts_at)}
                </p>
                {payMode === "per_student" ? (
                  <p className="text-sm text-stone-500">
                    學生：
                    {linkedStudentId
                      ? (studentName.get(linkedStudentId) ?? "—")
                      : "—"}
                  </p>
                ) : null}
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
          {confirmedLessons.length === 0 ? (
            <li className="py-3 text-sm text-stone-500">此結算期尚無已簽到課堂</li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
