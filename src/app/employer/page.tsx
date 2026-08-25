import type { Metadata } from "next";
import { cancelLessonAction, createLessonAction } from "@/actions/lessons";
import { ActionForm } from "@/components/action-form";
import { LessonRegisterFields } from "@/components/lesson-register-fields";
import { MonthCalendar } from "@/components/month-calendar";
import { ServerActionButton } from "@/components/server-action-button";
import { Field, Panel, SelectField, SubmitButton } from "@/components/ui";
import { TimeSelect } from "@/components/time-select";
import { requireEmployer } from "@/lib/auth";
import {
  lessonDayKey,
  monthBoundsIso,
  parseDayParam,
  parseMonthParam,
} from "@/lib/calendar";
import {
  formatDateTime,
  formatHeadcount,
  formatMoney,
  lessonStatusLabel,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ month?: string; day?: string }>;
};

export async function generateMetadata({  }: Props): Promise<Metadata> {
  return {
    title: `全體教練日曆`,
  };
}

export default async function EmployerHomePage({ searchParams }: Props) {
  await requireEmployer();
  const params = await searchParams;
  const month = parseMonthParam(params.month);
  const day = parseDayParam(params.day, month);
  const { start, end } = monthBoundsIso(month);

  const supabase = await createClient();
  const [
    { data: lessons },
    { data: types },
    { data: coaches },
    { data: students },
  ] = await Promise.all([
    supabase
      .from("lessons")
      .select("*")
      .neq("status", "cancelled")
      .gte("starts_at", start)
      .lt("starts_at", end)
      .order("starts_at", { ascending: true }),
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
  const coachMap = new Map((coaches ?? []).map((c) => [c.id, c.full_name]));
  const countsByDay = new Map<string, number>();
  const lessonsByDay = new Map<string, { id: string; coachName: string }[]>();
  for (const lesson of lessons ?? []) {
    const key = lessonDayKey(lesson.starts_at);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    const coachName = lesson.coach_id ? coachMap.get(lesson.coach_id) ?? "—" : "—";
    const list = lessonsByDay.get(key) ?? [];
    list.push({ id: lesson.id, coachName });
    lessonsByDay.set(key, list);
  }

  const dayLessons = (lessons ?? []).filter(
    (lesson) => lessonDayKey(lesson.starts_at) === day,
  );

  const typeOptions = (types ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    pay_mode: t.pay_mode,
  }));

  return (
    <div className="space-y-6">
      <Panel title="全體教練日曆">
        <MonthCalendar
          month={month}
          selectedDay={day}
          basePath="/employer"
          countsByDay={countsByDay}
          lessonsByDay={lessonsByDay}
        />
      </Panel>

      <Panel title={`建立課堂 · ${day}`}>
        <p className="mb-3 text-sm text-stone-500">
          建立後即計入該教練薪資。PT 需選學生；MIIT 需填人數。
        </p>
        <ActionForm
          action={createLessonAction}
          className="grid gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="date" value={day} />
          <SelectField
            label="教練"
            name="coach_id"
            required
            options={(coaches ?? []).map((c) => ({
              value: c.id,
              label: c.full_name,
            }))}
          />
          <LessonRegisterFields
            types={typeOptions}
            students={students ?? []}
          />
          <div className="grid grid-cols-2 gap-3">
            <TimeSelect label="開始" name="start_time" required />
            <TimeSelect label="結束" name="end_time" required />
          </div>
          <Field label="備註" name="notes" />
          <div className="sm:col-span-2">
            <SubmitButton>建立</SubmitButton>
          </div>
        </ActionForm>
      </Panel>

      <Panel title={`${day} 的課堂`}>
        <ul className="divide-y divide-stone-100">
          {dayLessons.map((lesson) => {
            const linkedStudentId = studentByLesson.get(lesson.id);
            return (
              <li key={lesson.id} className="space-y-2 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {typeMap.get(lesson.lesson_type_id) ?? "課堂"} ·{" "}
                      {lessonStatusLabel(lesson.status)}
                    </p>
                    <p className="text-sm text-stone-500">
                      {formatDateTime(lesson.starts_at)} –{" "}
                      {formatDateTime(lesson.ends_at).slice(11)}
                    </p>
                    <p className="text-sm text-stone-500">
                      教練：
                      {lesson.coach_id
                        ? (coachMap.get(lesson.coach_id) ?? "—")
                        : "—"}
                    </p>
                    {linkedStudentId ? (
                      <p className="text-sm text-stone-500">
                        學生：{studentName.get(linkedStudentId) ?? "—"}
                      </p>
                    ) : null}
                    {formatHeadcount(lesson.headcount, lesson.expected_headcount) ? (
                      <p className="text-sm text-stone-500">
                        人數：
                        {formatHeadcount(lesson.headcount, lesson.expected_headcount)}
                      </p>
                    ) : null}
                    {lesson.student_fee_hkd != null ? (
                      <p className="text-sm text-stone-500">
                        學生學費：{formatMoney(Number(lesson.student_fee_hkd))}
                      </p>
                    ) : null}
                    {lesson.earned_amount_hkd != null ? (
                      <p className="text-sm text-emerald-700">
                        教練薪資：{formatMoney(Number(lesson.earned_amount_hkd))}
                      </p>
                    ) : null}
                  </div>
                  {lesson.status !== "cancelled" ? (
                    <ServerActionButton
                      action={cancelLessonAction.bind(null, lesson.id)}
                      confirmMessage="確定取消此課堂？將不再計入薪資。"
                      className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:opacity-60"
                    >
                      取消
                    </ServerActionButton>
                  ) : null}
                </div>
              </li>
            );
          })}
          {dayLessons.length === 0 ? (
            <li className="py-3 text-sm text-stone-500">這天尚未有課堂</li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
