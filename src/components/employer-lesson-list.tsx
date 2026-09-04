import { cancelLessonAction } from "@/actions/lessons";
import { EmployerLessonFeeForm } from "@/components/employer-lesson-fee-form";
import { ServerActionButton } from "@/components/server-action-button";
import { Panel } from "@/components/ui";
import { availabilityWeekBoundsIso } from "@/lib/calendar";
import {
  formatDateTime,
  formatLessonSizeLabel,
  formatMoneyOrPending,
  lessonStatusLabel,
} from "@/lib/format";
import type { LessonStatus, PayMode } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

type LessonTypeOption = {
  id: string;
  name: string;
  pay_mode: PayMode;
};

type LessonRow = {
  id: string;
  lesson_type_id: string;
  starts_at: string;
  ends_at: string;
  status: LessonStatus;
  earned_amount_hkd: number | null;
  student_fee_hkd: number | null;
  headcount: number | null;
  expected_headcount: number | null;
  lesson_students:
    | {
        students: { name: string } | { name: string }[] | null;
      }[]
    | null;
};

function nestedStudentName(row: {
  students: { name: string } | { name: string }[] | null;
}): string | null {
  const related = row.students;
  if (!related) {
    return null;
  }
  if (Array.isArray(related)) {
    return related[0]?.name ?? null;
  }
  return related.name;
}

export async function EmployerLessonList({
  coachId,
  coachName,
  listWeek,
  listWeekEnd,
  prevListWeekHref,
  nextListWeekHref,
  currentListWeekHref,
  isCurrentListWeek,
  types,
}: {
  coachId: string;
  coachName: string;
  listWeek: string;
  listWeekEnd: string;
  prevListWeekHref: string;
  nextListWeekHref: string;
  currentListWeekHref: string;
  isCurrentListWeek: boolean;
  types: LessonTypeOption[];
}) {
  const { start, end } = availabilityWeekBoundsIso(listWeek);
  const supabase = await createClient();
  const { data: lessonRows, error } = await supabase
    .from("lessons")
    .select(
      "id, lesson_type_id, starts_at, ends_at, status, earned_amount_hkd, student_fee_hkd, headcount, expected_headcount, lesson_students ( students ( name ) )",
    )
    .eq("coach_id", coachId)
    .neq("status", "cancelled")
    .gte("starts_at", start)
    .lt("starts_at", end)
    .order("starts_at", { ascending: true });

  if (error) {
    console.error("[EmployerLessonList] load lessons", {
      error,
      coachId,
      listWeek,
    });
  }

  const coachLessons = (lessonRows ?? []) as LessonRow[];
  const typeName = new Map(types.map((type) => [type.id, type.name]));
  const payModeByType = new Map(types.map((type) => [type.id, type.pay_mode]));

  return (
    <Panel title={`${coachName} 的派更列表`}>
      <div className="mb-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={prevListWeekHref}
            className="text-sm text-stone-600 underline"
          >
            上週
          </Link>
          <p className="text-sm font-medium">
            {listWeek} – {listWeekEnd}
          </p>
          <Link
            href={nextListWeekHref}
            className="text-sm text-stone-600 underline"
          >
            下週
          </Link>
        </div>
        {!isCurrentListWeek ? (
          <Link
            href={currentListWeekHref}
            className="text-sm text-stone-600 underline"
          >
            返回本週
          </Link>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          無法載入派更列表
        </p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {coachLessons.map((lesson) => {
            const sizeLabel = formatLessonSizeLabel(
              payModeByType.get(lesson.lesson_type_id),
              lesson.headcount,
              lesson.expected_headcount,
            );
            const studentNames = (lesson.lesson_students ?? [])
              .map(nestedStudentName)
              .filter((name): name is string => Boolean(name));
            return (
              <li key={lesson.id} className="space-y-2 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {typeName.get(lesson.lesson_type_id) ?? "課堂"} ·{" "}
                      {lessonStatusLabel(lesson.status)}
                    </p>
                    <p className="text-sm text-stone-500">
                      {formatDateTime(lesson.starts_at)} –{" "}
                      {formatDateTime(lesson.ends_at).slice(11)}
                    </p>
                    <p className="text-sm text-stone-500">
                      學生：{studentNames.join("、") || "無"}
                    </p>
                    {sizeLabel ? (
                      <p className="text-sm text-stone-500">{sizeLabel}</p>
                    ) : null}
                    {payModeByType.get(lesson.lesson_type_id) ===
                    "per_student" ? (
                      <p className="text-sm text-stone-500">
                        學生學費：
                        {formatMoneyOrPending(lesson.student_fee_hkd)}
                      </p>
                    ) : null}
                    <p
                      className={
                        lesson.earned_amount_hkd == null
                          ? "text-sm text-amber-700"
                          : "text-sm text-emerald-700"
                      }
                    >
                      教練薪資：
                      {formatMoneyOrPending(lesson.earned_amount_hkd)}
                    </p>
                  </div>
                  {lesson.status !== "cancelled" ? (
                    <ServerActionButton
                      action={cancelLessonAction.bind(null, lesson.id)}
                      confirmMessage="確定取消此派更？將不再計入薪資。"
                      className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      取消
                    </ServerActionButton>
                  ) : null}
                </div>
                {lesson.status !== "cancelled" ? (
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
                ) : null}
              </li>
            );
          })}
          {coachLessons.length === 0 ? (
            <li className="py-3 text-sm text-stone-500">此週尚未有派更</li>
          ) : null}
        </ul>
      )}
    </Panel>
  );
}
