import { cancelLessonAction } from "@/actions/lessons";
import { EmployerAssignWorkspace } from "@/components/employer-assign-workspace";
import { EmployerCoachPicker } from "@/components/employer-coach-picker";
import { EmployerLessonFeeForm } from "@/components/employer-lesson-fee-form";
import { ServerActionButton } from "@/components/server-action-button";
import { Panel } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import {
  availabilityWeekBoundsIso,
  availabilityWeekDays,
  availabilityWeekStart,
  hongKongToday,
  parseAvailabilityWeekParam,
  shiftAvailabilityWeek,
} from "@/lib/calendar";
import {
  formatDateTime,
  formatLessonSizeLabel,
  formatMoneyOrPending,
  lessonStatusLabel,
} from "@/lib/format";
import type { LessonStatus } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

type Props = {
  searchParams: Promise<{ coach?: string; week?: string; listWeek?: string }>;
};

function lessonsHref(
  coachId: string,
  opts: { week?: string; listWeek?: string },
) {
  const query = new URLSearchParams({ coach: coachId });
  if (opts.week) {
    query.set("week", opts.week);
  }
  if (opts.listWeek) {
    query.set("listWeek", opts.listWeek);
  }
  return `/employer/lessons?${query.toString()}`;
}

export default async function LessonsPage({ searchParams }: Props) {
  await requireEmployer();
  const params = await searchParams;
  const today = hongKongToday();
  const week = parseAvailabilityWeekParam(params.week);
  const listWeek = parseAvailabilityWeekParam(params.listWeek);
  const currentWeek = availabilityWeekStart();
  const days = availabilityWeekDays(week);
  const weekEnd = days[6];
  const prevWeek = shiftAvailabilityWeek(week, -1);
  const nextWeek = shiftAvailabilityWeek(week, 1);
  const listWeekDays = availabilityWeekDays(listWeek);
  const listWeekEnd = listWeekDays[6];
  const prevListWeek = shiftAvailabilityWeek(listWeek, -1);
  const nextListWeek = shiftAvailabilityWeek(listWeek, 1);
  const { start: listWeekStartIso, end: listWeekEndIso } =
    availabilityWeekBoundsIso(listWeek);
  const preservedWeek = params.week ? week : undefined;
  const preservedListWeek = params.listWeek ? listWeek : undefined;

  const supabase = await createClient();
  const [{ data: types }, { data: coaches }, { data: students }] =
    await Promise.all([
      supabase
        .from("lesson_types")
        .select("id, name, default_duration_minutes, pay_mode")
        .eq("active", true)
        .order("name"),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "coach")
        .order("full_name"),
      supabase
        .from("students")
        .select("id, name")
        .eq("active", true)
        .order("name"),
    ]);

  const selectedCoach =
    (coaches ?? []).find((coach) => coach.id === params.coach) ?? null;

  let slots: {
    id: string;
    available_date: string;
    start_minute: number;
    end_minute: number;
  }[] = [];
  let leaveDates: string[] = [];
  let coachLessons: {
    id: string;
    lesson_type_id: string;
    starts_at: string;
    ends_at: string;
    status: LessonStatus;
    earned_amount_hkd: number | null;
    student_fee_hkd: number | null;
    headcount: number | null;
    expected_headcount: number | null;
  }[] = [];

  if (selectedCoach) {
    const [
      { data: availabilities },
      { data: leaves },
      { data: lessonRows },
    ] = await Promise.all([
      supabase
        .from("staff_availabilities")
        .select("id, available_date, start_minute, end_minute")
        .eq("coach_id", selectedCoach.id)
        .gte("available_date", week)
        .lte("available_date", weekEnd)
        .order("available_date")
        .order("start_minute"),
      supabase
        .from("staff_leaves")
        .select("leave_date")
        .eq("coach_id", selectedCoach.id)
        .gte("leave_date", week)
        .lte("leave_date", weekEnd),
      supabase
        .from("lessons")
        .select(
          "id, lesson_type_id, starts_at, ends_at, status, earned_amount_hkd, student_fee_hkd, headcount, expected_headcount",
        )
        .eq("coach_id", selectedCoach.id)
        .neq("status", "cancelled")
        .gte("starts_at", listWeekStartIso)
        .lt("starts_at", listWeekEndIso)
        .order("starts_at", { ascending: true }),
    ]);

    slots = availabilities ?? [];
    leaveDates = (leaves ?? []).map((leave) => leave.leave_date);
    coachLessons = (lessonRows ?? []) as typeof coachLessons;
  }

  const lessonIds = coachLessons.map((l) => l.id);
  const { data: lessonStudents } =
    lessonIds.length > 0
      ? await supabase
          .from("lesson_students")
          .select("lesson_id, student_id")
          .in("lesson_id", lessonIds)
      : { data: [] };

  const typeName = new Map((types ?? []).map((t) => [t.id, t.name]));
  const payModeByType = new Map((types ?? []).map((t) => [t.id, t.pay_mode]));
  const studentName = new Map((students ?? []).map((s) => [s.id, s.name]));
  const studentsByLesson = new Map<string, string[]>();
  for (const row of lessonStudents ?? []) {
    const list = studentsByLesson.get(row.lesson_id) ?? [];
    list.push(studentName.get(row.student_id) ?? "學生");
    studentsByLesson.set(row.lesson_id, list);
  }

  return (
    <div className="space-y-6">
      <Panel title="派更">
        <p className="mb-3 text-sm text-stone-500">
          先選擇教練，再按其可返工時段派更。時段必須完全落在已報可返工範圍內；放假日不可派。派更後為「待員工確認」，員工確認後才計入薪資。金額可後補。
        </p>
        <EmployerCoachPicker
          coaches={coaches ?? []}
          selectedCoachId={selectedCoach?.id}
          week={preservedWeek}
          listWeek={preservedListWeek}
        />
      </Panel>

      {selectedCoach ? (
        <>
          <Panel title={`${selectedCoach.full_name} 的可返工`}>
            <EmployerAssignWorkspace
              coachId={selectedCoach.id}
              coachName={selectedCoach.full_name}
              week={week}
              weekEnd={weekEnd}
              days={days}
              today={today}
              prevWeekHref={lessonsHref(selectedCoach.id, {
                week: prevWeek,
                listWeek: preservedListWeek,
              })}
              nextWeekHref={lessonsHref(selectedCoach.id, {
                week: nextWeek,
                listWeek: preservedListWeek,
              })}
              currentWeekHref={lessonsHref(selectedCoach.id, {
                week: currentWeek,
                listWeek: preservedListWeek,
              })}
              isCurrentWeek={week === currentWeek}
              slots={slots}
              leaveDates={leaveDates}
              types={(types ?? []).map((t) => ({
                id: t.id,
                name: t.name,
                pay_mode: t.pay_mode,
                default_duration_minutes: t.default_duration_minutes,
              }))}
              students={students ?? []}
            />
          </Panel>

          <Panel title={`${selectedCoach.full_name} 的派更列表`}>
            <div className="mb-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={lessonsHref(selectedCoach.id, {
                    week: preservedWeek,
                    listWeek: prevListWeek,
                  })}
                  className="text-sm text-stone-600 underline"
                >
                  上週
                </Link>
                <p className="text-sm font-medium">
                  {listWeek} – {listWeekEnd}
                </p>
                <Link
                  href={lessonsHref(selectedCoach.id, {
                    week: preservedWeek,
                    listWeek: nextListWeek,
                  })}
                  className="text-sm text-stone-600 underline"
                >
                  下週
                </Link>
              </div>
              {listWeek !== currentWeek ? (
                <Link
                  href={lessonsHref(selectedCoach.id, {
                    week: preservedWeek,
                    listWeek: currentWeek,
                  })}
                  className="text-sm text-stone-600 underline"
                >
                  返回本週
                </Link>
              ) : null}
            </div>
            <ul className="divide-y divide-stone-100">
              {coachLessons.map((lesson) => {
                const sizeLabel = formatLessonSizeLabel(
                  payModeByType.get(lesson.lesson_type_id),
                  lesson.headcount,
                  lesson.expected_headcount,
                );
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
                          學生：
                          {(studentsByLesson.get(lesson.id) ?? []).join("、") ||
                            "無"}
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
          </Panel>
        </>
      ) : null}
    </div>
  );
}
