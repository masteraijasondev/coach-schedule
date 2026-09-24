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
import { formatDateTime, formatMoney, nestedStudentName } from "@/lib/format";
import { formatPayRatioPercent } from "@/lib/pt-rate";
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
  const [{ data: coach }, { data: lessons }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, staff_kind, hourly_rate_hkd, pay_ratio")
      .eq("id", coachId)
      .eq("role", "coach")
      .maybeSingle(),
    supabase
      .from("lessons")
      .select("id, starts_at, ends_at, earned_amount_hkd, student_fee_hkd")
      .eq("coach_id", coachId)
      .eq("status", "completed")
      .gte("starts_at", start)
      .lt("starts_at", end)
      .order("starts_at", { ascending: true }),
  ]);

  if (!coach) {
    notFound();
  }

  const isAdmin = coach.staff_kind === "operations";
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

  const total = (lessons ?? []).reduce(
    (sum, lesson) => sum + Number(lesson.earned_amount_hkd ?? 0),
    0,
  );
  const rateLabel = isAdmin
    ? coach.hourly_rate_hkd == null
      ? "未設定時薪"
      : `${formatMoney(Number(coach.hourly_rate_hkd))}/小時`
    : coach.pay_ratio == null
      ? "未設定分成"
      : `${formatPayRatioPercent(Number(coach.pay_ratio))}%`;

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
        <p className="mb-1 text-sm font-medium text-stone-800">
          {isAdmin ? "Admin · Hourly Rate" : "Coach · Ratio"}
        </p>
        <p className="mb-3 text-sm text-stone-500">
          結算期：{payrollPeriodLabel(period)} · {rateLabel}
          {isAdmin
            ? "。每段已簽到工時乘時薪。"
            : "。簽到時揀學生，學費取自 Airtable，再乘分成比例。"}
        </p>
        <p className="mb-3 text-sm">
          <Link
            href={`/employer/salary?month=${period}`}
            className="text-stone-600 underline"
          >
            ← 全部薪資
          </Link>
        </p>
        <ul className="divide-y divide-stone-100">
          {(lessons ?? []).map((lesson) => {
            const hours = hoursBetween(lesson.starts_at, lesson.ends_at);
            const studentName = studentByLesson.get(lesson.id);
            return (
              <li key={lesson.id} className="flex justify-between gap-3 py-3">
                <div>
                  <p className="text-sm tabular-nums text-stone-700">
                    {formatDateTime(lesson.starts_at)}
                  </p>
                  {isAdmin ? (
                    <p className="text-sm text-stone-500">
                      {hours.toFixed(1)} 小時
                    </p>
                  ) : (
                    <p className="text-sm text-stone-500">
                      學生：{studentName ?? "—"}
                      {lesson.student_fee_hkd == null
                        ? ""
                        : ` · 學費 ${formatMoney(Number(lesson.student_fee_hkd))}`}
                    </p>
                  )}
                </div>
                <p className="text-sm font-medium">
                  {formatMoney(Number(lesson.earned_amount_hkd ?? 0))}
                </p>
              </li>
            );
          })}
          {(lessons ?? []).length === 0 ? (
            <li className="py-3 text-sm text-stone-500">
              此結算期尚無已簽到課堂
            </li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
