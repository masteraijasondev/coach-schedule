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
        .select("id, full_name")
        .eq("id", coachId)
        .eq("role", "coach")
        .maybeSingle(),
      supabase
        .from("lessons")
        .select(
          "id, lesson_type_id, starts_at, ends_at, earned_amount_hkd, student_fee_hkd",
        )
        .eq("coach_id", coachId)
        .eq("status", "completed")
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

  const typeById = new Map((lessonTypes ?? []).map((type) => [type.id, type]));
  const lessonsByType = new Map<string, NonNullable<typeof lessons>>();
  for (const lesson of lessons ?? []) {
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
          <p className="text-lg font-semibold">{formatMoney(total)}</p>
          <Link
            href={`/employer/salary/${coachId}?month=${next}`}
            className="text-sm text-stone-600 underline"
          >
            下期
          </Link>
        </div>
        <p className="mb-3 text-sm text-stone-500">
          結算期：{payrollPeriodLabel(period)}。薪資按工作類型分開計算。
        </p>
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
