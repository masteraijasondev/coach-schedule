import Link from "next/link";
import { notFound } from "next/navigation";
import { EmployerLessonFeeForm } from "@/components/employer-lesson-fee-form";
import { Panel } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import {
  parsePayrollPeriodParam,
  payrollPeriodBoundsIso,
  payrollPeriodLabel,
  shiftMonth,
} from "@/lib/calendar";
import { formatDateTime, formatLessonSizeLabel, formatMoney, formatMoneyOrPending } from "@/lib/format";
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
      .select(
        "id, lesson_type_id, starts_at, earned_amount_hkd, student_fee_hkd, headcount, expected_headcount",
      )
      .eq("coach_id", coachId)
      .eq("status", "completed")
      .gte("starts_at", start)
      .lt("starts_at", end)
      .order("starts_at", { ascending: true }),
  ]);

  if (!coach) {
    notFound();
  }

  const lessonIds = (lessons ?? []).map((l) => l.id);
  const [{ data: types }, { data: lessonStudents }, { data: students }] =
    await Promise.all([
      [...new Set((lessons ?? []).map((l) => l.lesson_type_id))].length
        ? supabase
            .from("lesson_types")
            .select("id, name, pay_mode")
            .in(
              "id",
              [...new Set((lessons ?? []).map((l) => l.lesson_type_id))],
            )
        : Promise.resolve({ data: [] }),
      lessonIds.length
        ? supabase
            .from("lesson_students")
            .select("lesson_id, student_id")
            .in("lesson_id", lessonIds)
        : Promise.resolve({ data: [] }),
      supabase.from("students").select("id, name"),
    ]);

  const typeMap = new Map((types ?? []).map((t) => [t.id, t.name]));
  const payModeByType = new Map((types ?? []).map((t) => [t.id, t.pay_mode]));
  const studentByLesson = new Map(
    (lessonStudents ?? []).map((row) => [row.lesson_id, row.student_id]),
  );
  const studentName = new Map((students ?? []).map((s) => [s.id, s.name]));

  const total = (lessons ?? []).reduce(
    (sum, lesson) => sum + Number(lesson.earned_amount_hkd ?? 0),
    0,
  );

  const pendingCount = (lessons ?? []).filter(
    (lesson) => lesson.earned_amount_hkd == null,
  ).length;

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
          結算期：{payrollPeriodLabel(period)} · 已有金額的課堂計入總額；待補課堂可在下方改價錢。
        </p>
        {pendingCount > 0 ? (
          <p className="mb-3 text-sm text-amber-700">
            尚有 {pendingCount} 堂薪資待補，未計入上方總額。
          </p>
        ) : null}
        <p className="mb-3 text-sm">
          <Link
            href={`/employer/salary?month=${period}`}
            className="text-stone-600 underline"
          >
            ← 全部教練
          </Link>
        </p>
        <ul className="divide-y divide-stone-100">
          {(lessons ?? []).map((lesson) => {
            const linkedStudentId = studentByLesson.get(lesson.id);
            const payMode = payModeByType.get(lesson.lesson_type_id);
            const sizeLabel = formatLessonSizeLabel(
              payMode,
              lesson.headcount,
              lesson.expected_headcount,
            );
            return (
              <li key={lesson.id} className="space-y-3 py-3">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {typeMap.get(lesson.lesson_type_id) ?? "課堂"}
                    </p>
                    <p className="text-sm text-stone-500">
                      {formatDateTime(lesson.starts_at)}
                    </p>
                    {linkedStudentId ? (
                      <p className="text-sm text-stone-500">
                        學生：{studentName.get(linkedStudentId) ?? "—"}
                      </p>
                    ) : null}
                    {sizeLabel ? (
                      <p className="text-sm text-stone-500">{sizeLabel}</p>
                    ) : null}
                  </div>
                  <div className="text-right text-sm">
                    {payMode === "per_student" ? (
                      <p className="text-stone-500">
                        學費 {formatMoneyOrPending(lesson.student_fee_hkd)}
                      </p>
                    ) : null}
                    <p
                      className={
                        lesson.earned_amount_hkd == null
                          ? "font-medium text-amber-700"
                          : "font-medium"
                      }
                    >
                      {formatMoneyOrPending(lesson.earned_amount_hkd)}
                    </p>
                  </div>
                </div>
                <EmployerLessonFeeForm
                  lessonId={lesson.id}
                  studentFeeHkd={
                    lesson.student_fee_hkd == null
                      ? null
                      : Number(lesson.student_fee_hkd)
                  }
                  earnedAmountHkd={
                    lesson.earned_amount_hkd == null
                      ? null
                      : Number(lesson.earned_amount_hkd)
                  }
                />
              </li>
            );
          })}
          {(lessons ?? []).length === 0 ? (
            <li className="py-3 text-sm text-stone-500">
              此結算期尚無已確認課堂
            </li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
