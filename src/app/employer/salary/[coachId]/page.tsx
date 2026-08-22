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
import { formatDateTime, formatHeadcount, formatMoney } from "@/lib/format";
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
            .select("id, name")
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
  const studentByLesson = new Map(
    (lessonStudents ?? []).map((row) => [row.lesson_id, row.student_id]),
  );
  const studentName = new Map((students ?? []).map((s) => [s.id, s.name]));

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
          {(lessons ?? []).map((lesson) => {
            const linkedStudentId = studentByLesson.get(lesson.id);
            const headcountLabel = formatHeadcount(
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
                  {linkedStudentId ? (
                    <p className="text-sm text-stone-500">
                      學生：{studentName.get(linkedStudentId) ?? "—"}
                    </p>
                  ) : null}
                  {headcountLabel ? (
                    <p className="text-sm text-stone-500">人數：{headcountLabel}</p>
                  ) : null}
                </div>
                <div className="text-right text-sm">
                  {lesson.student_fee_hkd != null ? (
                    <p className="text-stone-500">
                      學費 {formatMoney(Number(lesson.student_fee_hkd))}
                    </p>
                  ) : null}
                  <p className="font-medium">
                    {formatMoney(Number(lesson.earned_amount_hkd ?? 0))}
                  </p>
                </div>
              </li>
            );
          })}
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
