import Link from "next/link";
import { Panel } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import {
  parsePayrollPeriodParam,
  payrollPeriodBoundsIso,
  payrollPeriodLabel,
  shiftMonth,
} from "@/lib/calendar";
import { DataValue, EmphasizedText } from "@/components/data-value";
import { ExpectedPaySummary, formatExpectedPay } from "@/components/expected-pay-summary";
import { PayMethodDetails } from "@/components/pay-method-details";
import {
  durationMinutes,
  expectedHourlyAmount,
  hourlyRateOrNull,
} from "@/lib/expected-pay";
import { formatDateTime, formatLessonSizeLabel, formatMoney, formatMoneyOrPending } from "@/lib/format";
import { describePayFormula, payRatioPercentLabel } from "@/lib/pay-formula";
import { relatedStudentName } from "@/lib/employer-calendar-data";
import { loadStaffCompensation } from "@/lib/staff-compensation";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ month?: string }>;
};

function SalaryWhen({
  startsAt,
  endsAt,
}: {
  startsAt: string;
  endsAt: string;
}) {
  const [startDate, startTime] = formatDateTime(startsAt).split(" ");
  const [endDate, endTime] = formatDateTime(endsAt).split(" ");
  const range =
    startDate === endDate ? `${startTime}–${endTime}` : `${startTime}–${endDate} ${endTime}`;
  return (
    <>
      {startDate} <span>{range}</span>
    </>
  );
}

export default async function CoachSalaryPage({ searchParams }: Props) {
  const coach = await requireCoach();
  const params = await searchParams;
  const period = parsePayrollPeriodParam(params.month);
  const { start, end } = payrollPeriodBoundsIso(period);

  const supabase = await createClient();
  const [{ data: lessons }, profile] = await Promise.all([
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
    loadStaffCompensation(coach.id),
  ]);
  const confirmedLessons = (lessons ?? []).filter(
    (lesson) => lesson.status === "completed",
  );
  const assignedLessons = (lessons ?? []).filter(
    (lesson) => lesson.status === "assigned",
  );
  const hourlyRate = hourlyRateOrNull(profile?.hourly_rate_hkd);
  const payRatio = hourlyRateOrNull(profile?.pay_ratio);
  const ratioLabel = payRatioPercentLabel(payRatio);

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
  const studentCountByLesson = new Map<string, number>();
  const studentName = new Map<string, string>();
  for (const row of lessonStudents ?? []) {
    studentByLesson.set(row.lesson_id, row.student_id);
    studentCountByLesson.set(
      row.lesson_id,
      (studentCountByLesson.get(row.lesson_id) ?? 0) + 1,
    );
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
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#2C2C2C]">薪資</h1>
        <p className="mt-1 text-sm text-[#525252]">
          <EmphasizedText
            figure
            text={`${period} 結算期（${payrollPeriodLabel(period)}）`}
          />
        </p>
      </div>
      <Panel title="本結算期">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            href={`/coach/salary?month=${prev}`}
            className="text-sm text-stone-600 underline"
          >
            上期
          </Link>
          <ExpectedPaySummary
            confirmed={total}
            expected={expected}
            tour="coach-salary-totals"
          />
          <Link
            href={`/coach/salary?month=${next}`}
            className="text-sm text-stone-600 underline"
          >
            下期
          </Link>
        </div>
        <PayMethodDetails>
          {ratioLabel ? <p>目前分成：{ratioLabel}</p> : null}
          {expected === 0 ? null : (
            <p>本頁預期合計 {formatExpectedPay(expected)}（時薪估計）。</p>
          )}
        </PayMethodDetails>
        {assignedLessons.length > 0 ? (
          <ul className="mb-4 divide-y divide-stone-100 rounded-md border border-dashed border-stone-300">
            {assignedLessons.map((lesson) => (
              <li key={lesson.id} className="flex justify-between gap-3 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">已派更，待簽到</p>
                  <p className="text-base font-bold italic tabular-nums text-stone-950">
                    <SalaryWhen startsAt={lesson.starts_at} endsAt={lesson.ends_at} />
                  </p>
                  <p className="text-xs text-stone-500">時薪估計（PT／MIIT 簽到後才計）</p>
                </div>
                <p className="text-stone-600">
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
            const formula = describePayFormula({
              payMode,
              studentCount: studentCountByLesson.get(lesson.id) ?? 0,
              payRatio,
              minutes: durationMinutes(lesson.starts_at, lesson.ends_at),
              unitRate: payMode === "per_hour" ? hourlyRate : null,
            });
            return (
            <li key={lesson.id} className="flex justify-between gap-3 py-3">
              <div>
                <p className="font-medium">
                  {typeMap.get(lesson.lesson_type_id) ?? "課堂"}
                </p>
                <p className="text-base font-bold italic tabular-nums text-stone-950">
                  <SalaryWhen startsAt={lesson.starts_at} endsAt={lesson.ends_at} />
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
                <p className="text-xs text-stone-500">{formula.line}</p>
              </div>
              <p
                className={
                  lesson.earned_amount_hkd == null ? "text-amber-700" : "text-stone-950"
                }
              >
                <DataValue figure>
                  {formatMoneyOrPending(lesson.earned_amount_hkd)}
                </DataValue>
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
