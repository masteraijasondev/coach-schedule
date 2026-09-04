import type { Metadata } from "next";
import { confirmLessonAction } from "@/actions/lessons";
import { CoachAvailabilityCalendar } from "@/components/coach-availability-calendar";
import { MonthCalendar } from "@/components/month-calendar";
import { ServerActionButton } from "@/components/server-action-button";
import { Panel } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import {
  lessonDayKey,
  monthBoundsIso,
  monthGridDateRange,
  parseDayParam,
  parseMonthParam,
} from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import {
  formatAvailabilityTime,
  formatDateTime,
  formatLessonSizeLabel,
  formatMoneyOrPending,
  lessonStatusLabel,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "date-fns-tz";

type Props = {
  searchParams: Promise<{ month?: string; day?: string; week?: string }>;
};

export async function generateMetadata({}: Props): Promise<Metadata> {
  return {
    title: `我的課堂日曆`,
  };
}

export default async function CoachCalendarPage({ searchParams }: Props) {
  const coach = await requireCoach();
  const params = await searchParams;
  const month = parseMonthParam(params.month);
  const day = parseDayParam(params.day, month);
  const { start, end } = monthBoundsIso(month);
  const gridRange = monthGridDateRange(month);

  const supabase = await createClient();
  const [
    { data: lessons },
    { data: types },
    { data: students },
    { data: availabilities },
    { data: leaves },
  ] = await Promise.all([
    supabase
      .from("lessons")
      .select("*")
      .eq("coach_id", coach.id)
      .neq("status", "cancelled")
      .gte("starts_at", start)
      .lt("starts_at", end)
      .order("starts_at", { ascending: true }),
    supabase
      .from("lesson_types")
      .select("id, name, pay_mode")
      .eq("active", true)
      .order("name"),
    supabase
      .from("students")
      .select("id, name")
      .eq("active", true)
      .order("name"),
    supabase
      .from("staff_availabilities")
      .select("id, coach_id, available_date, start_minute, end_minute")
      .eq("coach_id", coach.id)
      .gte("available_date", gridRange.start)
      .lte("available_date", gridRange.end)
      .order("start_minute"),
    supabase
      .from("staff_leaves")
      .select("id, coach_id, leave_date")
      .eq("coach_id", coach.id)
      .gte("leave_date", gridRange.start)
      .lte("leave_date", gridRange.end),
  ]);

  const lessonIds = (lessons ?? []).map((l) => l.id);
  const { data: lessonStudents } =
    lessonIds.length > 0
      ? await supabase
          .from("lesson_students")
          .select("lesson_id, student_id")
          .in("lesson_id", lessonIds)
      : { data: [] };

  const studentByLesson = new Map(
    (lessonStudents ?? []).map((row) => [row.lesson_id, row.student_id]),
  );
  const studentName = new Map((students ?? []).map((s) => [s.id, s.name]));
  const typeMap = new Map((types ?? []).map((t) => [t.id, t.name]));
  const payModeByType = new Map((types ?? []).map((t) => [t.id, t.pay_mode]));
  const countsByDay = new Map<string, number>();
  const lessonsByDay = new Map<
    string,
    { id: string; coachName: string; status?: string }[]
  >();
  for (const lesson of lessons ?? []) {
    const key = lessonDayKey(lesson.starts_at);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    const list = lessonsByDay.get(key) ?? [];
    list.push({
      id: lesson.id,
      coachName: coach.full_name,
      status: lesson.status,
    });
    lessonsByDay.set(key, list);
  }

  const leaveDates = new Set(
    (leaves ?? []).map((leave) => leave.leave_date),
  );
  const availabilityByDay = new Map<
    string,
    { id: string; label: string; coachName: string; variant?: "slot" | "leave" }[]
  >();
  for (const leave of leaves ?? []) {
    availabilityByDay.set(leave.leave_date, [
      {
        id: leave.id,
        label: "放假",
        coachName: coach.full_name,
        variant: "leave",
      },
    ]);
  }
  for (const availability of availabilities ?? []) {
    if (leaveDates.has(availability.available_date)) {
      continue;
    }
    const list = availabilityByDay.get(availability.available_date) ?? [];
    list.push({
      id: availability.id,
      label: `${formatAvailabilityTime(availability.start_minute)}–${formatAvailabilityTime(availability.end_minute)}`,
      coachName: coach.full_name,
    });
    availabilityByDay.set(availability.available_date, list);
  }

  const dayLessons = (lessons ?? []).filter(
    (lesson) => lessonDayKey(lesson.starts_at) === day,
  );
  const now = new Date();

  return (
    <div className="space-y-6">
      <Panel title="我的課堂日曆">
        <p className="mb-3 text-sm text-stone-500">
          請先提交可返工時間。僱主派更後會顯示「待員工確認」；確認後才計入薪資。
        </p>
        <MonthCalendar
          month={month}
          selectedDay={day}
          basePath="/coach"
          countsByDay={countsByDay}
          lessonsByDay={lessonsByDay}
          availabilityByDay={availabilityByDay}
        />
      </Panel>

      <Panel title={`${day} 的課堂`}>
        <ul className="divide-y divide-stone-100">
          {dayLessons.map((lesson) => {
            const endTime = formatInTimeZone(lesson.ends_at, TIMEZONE, "HH:mm");
            const linkedStudentId = studentByLesson.get(lesson.id);
            const canConfirm =
              lesson.status === "assigned" &&
              new Date(lesson.starts_at) > now;
            const sizeLabel = formatLessonSizeLabel(
              payModeByType.get(lesson.lesson_type_id),
              lesson.headcount,
              lesson.expected_headcount,
            );
            return (
              <li key={lesson.id} className="space-y-3 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {typeMap.get(lesson.lesson_type_id) ?? "課堂"} ·{" "}
                      {lessonStatusLabel(lesson.status)}
                    </p>
                    <p className="text-sm text-stone-500">
                      {formatDateTime(lesson.starts_at)} – {endTime}
                    </p>
                    {linkedStudentId ? (
                      <p className="text-sm text-stone-500">
                        學生：{studentName.get(linkedStudentId) ?? "—"}
                      </p>
                    ) : null}
                    {sizeLabel ? (
                      <p className="text-sm text-stone-500">{sizeLabel}</p>
                    ) : null}
                    <p
                      className={
                        lesson.earned_amount_hkd == null
                          ? "text-sm text-amber-700"
                          : "text-sm text-emerald-700"
                      }
                    >
                      {formatMoneyOrPending(lesson.earned_amount_hkd)}
                    </p>
                    {lesson.status === "assigned" &&
                    new Date(lesson.starts_at) <= now ? (
                      <p className="mt-1 text-sm text-amber-700">
                        已過開始時間，無法確認；請聯絡僱主取消或重派。
                      </p>
                    ) : null}
                  </div>
                  {canConfirm ? (
                    <ServerActionButton
                      action={confirmLessonAction.bind(null, lesson.id)}
                      confirmMessage="確定接受此派更？確認後將計入薪資。"
                      className="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-60"
                    >
                      確認派更
                    </ServerActionButton>
                  ) : null}
                </div>
              </li>
            );
          })}
          {dayLessons.length === 0 ? (
            <li className="py-3 text-sm text-stone-500">這天尚未有派更</li>
          ) : null}
        </ul>
      </Panel>

      <section id="availability" className="scroll-mt-4">
        <CoachAvailabilityCalendar
          coachId={coach.id}
          weekParam={params.week}
          month={month}
          day={day}
        />
      </section>
    </div>
  );
}
