import {
  createCoachLessonAction,
  deleteCoachLessonAction,
  updateCoachLessonAction,
} from "@/actions/lessons";
import { ActionForm } from "@/components/action-form";
import { MonthCalendar } from "@/components/month-calendar";
import { ServerActionButton } from "@/components/server-action-button";
import { Panel, SelectField, SubmitButton } from "@/components/ui";
import { TimeSelect } from "@/components/time-select";
import { requireCoach } from "@/lib/auth";
import {
  lessonDayKey,
  monthBoundsIso,
  parseDayParam,
  parseMonthParam,
} from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import { formatDateTime, formatMoney, lessonStatusLabel } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "date-fns-tz";

type Props = {
  searchParams: Promise<{ month?: string; day?: string }>;
};

export default async function CoachCalendarPage({ searchParams }: Props) {
  const coach = await requireCoach();
  const params = await searchParams;
  const month = parseMonthParam(params.month);
  const day = parseDayParam(params.day, month);
  const { start, end } = monthBoundsIso(month);

  const supabase = await createClient();
  const [{ data: lessons }, { data: types }] = await Promise.all([
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
      .select("id, name")
      .eq("active", true)
      .order("name"),
  ]);

  const typeMap = new Map((types ?? []).map((t) => [t.id, t.name]));
  const countsByDay = new Map<string, number>();
  for (const lesson of lessons ?? []) {
    const key = lessonDayKey(lesson.starts_at);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  }

  const dayLessons = (lessons ?? []).filter(
    (lesson) => lessonDayKey(lesson.starts_at) === day,
  );

  const typeOptions = (types ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }));

  return (
    <div className="space-y-6">
      <Panel title="我的課堂日曆">
        <MonthCalendar
          month={month}
          selectedDay={day}
          basePath="/coach"
          countsByDay={countsByDay}
        />
      </Panel>

      <Panel title={`登記課堂 · ${day}`}>
        <p className="mb-3 text-sm text-stone-500">
          登記後即計入薪資（需已設定該課堂類型的薪資規則）。
        </p>
        <ActionForm
          action={createCoachLessonAction}
          className="grid gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="date" value={day} />
          <SelectField
            label="課堂類型"
            name="lesson_type_id"
            required
            options={typeOptions}
          />
          <div className="grid grid-cols-2 gap-3">
            <TimeSelect label="開始" name="start_time" required />
            <TimeSelect label="結束" name="end_time" required />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton>加入日曆</SubmitButton>
          </div>
        </ActionForm>
      </Panel>

      <Panel title={`${day} 的課堂`}>
        <ul className="divide-y divide-stone-100">
          {dayLessons.map((lesson) => {
            const startTime = formatInTimeZone(
              lesson.starts_at,
              TIMEZONE,
              "HH:mm",
            );
            const endTime = formatInTimeZone(lesson.ends_at, TIMEZONE, "HH:mm");
            const canDelete =
              lesson.status === "completed" || lesson.status === "assigned";
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
                    {lesson.earned_amount_hkd != null ? (
                      <p className="text-sm text-emerald-700">
                        {formatMoney(Number(lesson.earned_amount_hkd))}
                      </p>
                    ) : null}
                  </div>
                  {canDelete ? (
                    <ServerActionButton
                      action={deleteCoachLessonAction.bind(null, lesson.id)}
                      confirmMessage="確定刪除此課堂？薪資將一併移除。"
                      className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:opacity-60"
                    >
                      刪除
                    </ServerActionButton>
                  ) : null}
                </div>

                {lesson.status === "completed" ? (
                  <ActionForm
                    action={updateCoachLessonAction}
                    className="grid gap-3 rounded-md border border-stone-100 bg-stone-50 p-3 sm:grid-cols-2"
                  >
                    <input type="hidden" name="lesson_id" value={lesson.id} />
                    <input type="hidden" name="date" value={day} />
                    <SelectField
                      label="課堂類型"
                      name="lesson_type_id"
                      required
                      defaultValue={lesson.lesson_type_id}
                      options={typeOptions}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <TimeSelect
                        label="開始"
                        name="start_time"
                        required
                        defaultValue={startTime}
                      />
                      <TimeSelect
                        label="結束"
                        name="end_time"
                        required
                        defaultValue={endTime}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <SubmitButton>更新</SubmitButton>
                    </div>
                  </ActionForm>
                ) : null}
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
