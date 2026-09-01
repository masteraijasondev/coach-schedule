import type { Metadata } from "next";
import { cancelLessonAction, createLessonAction } from "@/actions/lessons";
import { ActionForm } from "@/components/action-form";
import { EmployerLessonFeeForm } from "@/components/employer-lesson-fee-form";
import { LessonRegisterFields } from "@/components/lesson-register-fields";
import { MonthCalendar } from "@/components/month-calendar";
import { ServerActionButton } from "@/components/server-action-button";
import { Field, Panel, SelectField, SubmitButton } from "@/components/ui";
import { TimeSelect } from "@/components/time-select";
import { requireEmployer } from "@/lib/auth";
import {
  lessonDayKey,
  monthBoundsIso,
  monthGridDateRange,
  parseDayParam,
  parseMonthParam,
} from "@/lib/calendar";
import {
  formatAvailabilityTime,
  formatDateTime,
  formatLessonSizeLabel,
  formatMoneyOrPending,
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
  const gridRange = monthGridDateRange(month);

  const supabase = await createClient();
  const [
    { data: lessons },
    { data: types },
    { data: coaches },
    { data: students },
    { data: availabilities },
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
    supabase
      .from("staff_availabilities")
      .select("id, coach_id, available_date, start_minute, end_minute")
      .gte("available_date", gridRange.start)
      .lte("available_date", gridRange.end)
      .order("start_minute"),
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

  const availabilityByDay = new Map<
    string,
    { id: string; label: string; coachName: string }[]
  >();
  for (const availability of availabilities ?? []) {
    const coachName = coachMap.get(availability.coach_id) ?? "—";
    const list = availabilityByDay.get(availability.available_date) ?? [];
    if (!list.some((entry) => entry.id === availability.coach_id)) {
      list.push({
        id: availability.coach_id,
        label: coachName,
        coachName,
      });
      availabilityByDay.set(availability.available_date, list);
    }
  }

  const dayAvailabilityByCoach = new Map<
    string,
    {
      coachName: string;
      slots: { id: string; start: number; end: number }[];
    }
  >();
  for (const availability of availabilities ?? []) {
    if (availability.available_date !== day) {
      continue;
    }
    const coachName = coachMap.get(availability.coach_id) ?? "—";
    const existing = dayAvailabilityByCoach.get(availability.coach_id);
    const group = existing ?? {
      coachName,
      slots: [] as { id: string; start: number; end: number }[],
    };
    group.slots.push({
      id: availability.id,
      start: availability.start_minute,
      end: availability.end_minute,
    });
    dayAvailabilityByCoach.set(availability.coach_id, group);
  }
  const dayAvailabilities = [...dayAvailabilityByCoach.entries()].map(
    ([coachId, group]) => ({ coachId, ...group }),
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
          availabilityByDay={availabilityByDay}
        />
      </Panel>

      <Panel title={`建立課堂 · ${day}`}>
        <p className="mb-3 text-sm text-stone-500">
          PT 必須選學生與 1:1／1:2／1:3；未有價錢可先建立，之後在下方改金額。MIIT
          需填人數。PTA／Admin 只需類型與時間。
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
                    {sizeLabel ? (
                      <p className="text-sm text-stone-500">{sizeLabel}</p>
                    ) : null}
                    {payModeByType.get(lesson.lesson_type_id) === "per_student" ? (
                      <p className="text-sm text-stone-500">
                        學生學費：{formatMoneyOrPending(lesson.student_fee_hkd)}
                      </p>
                    ) : null}
                    <p
                      className={
                        lesson.earned_amount_hkd == null
                          ? "text-sm text-amber-700"
                          : "text-sm text-emerald-700"
                      }
                    >
                      教練薪資：{formatMoneyOrPending(lesson.earned_amount_hkd)}
                    </p>
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
          {dayLessons.length === 0 ? (
            <li className="py-3 text-sm text-stone-500">這天尚未有課堂</li>
          ) : null}
        </ul>
      </Panel>

      <Panel title={`${day} 可返工`}>
        <ul className="divide-y divide-stone-100">
          {dayAvailabilities.map((group) => (
            <li key={group.coachId} className="py-3">
              <p className="font-medium">{group.coachName}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {group.slots.map((slot) => (
                  <span
                    key={slot.id}
                    className="rounded-md border border-dashed border-sky-300 bg-sky-50 px-2 py-1 text-sm text-sky-900"
                  >
                    {formatAvailabilityTime(slot.start)}–
                    {formatAvailabilityTime(slot.end)}
                  </span>
                ))}
              </div>
            </li>
          ))}
          {dayAvailabilities.length === 0 ? (
            <li className="py-3 text-sm text-stone-500">
              這天尚未有人報可返工
            </li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
