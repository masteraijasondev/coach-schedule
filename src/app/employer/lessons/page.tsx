import { cancelLessonAction, createLessonAction } from "@/actions/lessons";
import { ActionForm } from "@/components/action-form";
import { ServerActionButton } from "@/components/server-action-button";
import { Field, Panel, SelectField, SubmitButton } from "@/components/ui";
import { TimeSelect } from "@/components/time-select";
import { requireEmployer } from "@/lib/auth";
import { hongKongToday } from "@/lib/calendar";
import {
  formatDateTime,
  formatMoney,
  lessonStatusLabel,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function LessonsPage() {
  await requireEmployer();
  const supabase = await createClient();
  const today = hongKongToday();

  const [
    { data: lessons },
    { data: types },
    { data: coaches },
    { data: students },
    { data: lessonStudents },
  ] = await Promise.all([
    supabase
      .from("lessons")
      .select("*")
      .order("starts_at", { ascending: false })
      .limit(100),
    supabase
      .from("lesson_types")
      .select("id, name, default_duration_minutes")
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
    supabase.from("lesson_students").select("lesson_id, student_id"),
  ]);

  const typeName = new Map((types ?? []).map((t) => [t.id, t.name]));
  const coachName = new Map((coaches ?? []).map((c) => [c.id, c.full_name]));
  const studentName = new Map((students ?? []).map((s) => [s.id, s.name]));
  const studentsByLesson = new Map<string, string[]>();
  for (const row of lessonStudents ?? []) {
    const list = studentsByLesson.get(row.lesson_id) ?? [];
    list.push(studentName.get(row.student_id) ?? "學生");
    studentsByLesson.set(row.lesson_id, list);
  }

  return (
    <div className="space-y-6">
      <Panel title="建立課堂">
        <p className="mb-3 text-sm text-stone-500">
          建立後即計入該教練薪資（需已設定對應課堂類型薪資）。
        </p>
        <ActionForm action={createLessonAction} className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="課堂類型"
            name="lesson_type_id"
            required
            options={(types ?? []).map((t) => ({
              value: t.id,
              label: `${t.name}（${t.default_duration_minutes} 分）`,
            }))}
          />
          <SelectField
            label="教練"
            name="coach_id"
            required
            options={(coaches ?? []).map((c) => ({
              value: c.id,
              label: c.full_name,
            }))}
          />
          <Field label="日期" name="date" type="date" required defaultValue={today} />
          <div className="grid grid-cols-2 gap-3">
            <TimeSelect label="開始" name="start_time" required />
            <TimeSelect label="結束" name="end_time" required />
          </div>
          <label className="block space-y-1 text-sm sm:col-span-2">
            <span className="text-stone-700">學生（可多選）</span>
            <select
              name="student_ids"
              multiple
              className="h-28 w-full rounded-md border border-stone-300 bg-white px-3 py-2"
            >
              {(students ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="備註" name="notes" />
          <div className="sm:col-span-2">
            <SubmitButton>建立</SubmitButton>
          </div>
        </ActionForm>
      </Panel>

      <Panel title="課堂列表">
        <ul className="divide-y divide-stone-100">
          {(lessons ?? []).map((lesson) => (
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
                    教練：
                    {lesson.coach_id
                      ? (coachName.get(lesson.coach_id) ?? "—")
                      : "—"}
                  </p>
                  <p className="text-sm text-stone-500">
                    學生：
                    {(studentsByLesson.get(lesson.id) ?? []).join("、") || "無"}
                  </p>
                  {lesson.earned_amount_hkd != null ? (
                    <p className="text-sm text-emerald-700">
                      {formatMoney(Number(lesson.earned_amount_hkd))}
                    </p>
                  ) : null}
                </div>
                {lesson.status !== "cancelled" ? (
                  <ServerActionButton
                    action={cancelLessonAction.bind(null, lesson.id)}
                    confirmMessage="確定取消此課堂？將不再計入薪資。"
                    className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    取消
                  </ServerActionButton>
                ) : null}
              </div>
            </li>
          ))}
          {(lessons ?? []).length === 0 ? (
            <li className="py-3 text-sm text-stone-500">尚未有課堂</li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
