import type { Metadata } from "next";
import { confirmLessonAction } from "@/actions/lessons";
import { CalendarViewToggle } from "@/components/calendar-view-toggle";
import { CoachAvailabilityCalendar } from "@/components/coach-availability-calendar";
import { MonthCalendar } from "@/components/month-calendar";
import { ServerActionButton } from "@/components/server-action-button";
import { Panel } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import {
  availabilityWeekStart,
  hongKongToday,
  overlappingLesson,
  lessonDayKey,
  monthBoundsIso,
  monthGridDateRange,
  parseCalendarView,
  parseDayParam,
  parseMonthParam,
} from "@/lib/calendar";
import { coachCalendarHref } from "@/lib/coach-href";
import { TIMEZONE } from "@/lib/constants";
import { formatAvailabilityTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "date-fns-tz";

type Props = {
  searchParams: Promise<{ month?: string; day?: string; week?: string; view?: string }>;
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
  const today = hongKongToday();
  const view = parseCalendarView(params.view);
  const { start, end } = monthBoundsIso(month);
  const gridRange = monthGridDateRange(month);

  const supabase = await createClient();
  const [{ data: lessons }, { data: availabilities }, { data: leaves }] =
    await Promise.all([
      supabase
        .from("lessons")
        .select("id, starts_at, ends_at, status")
        .eq("coach_id", coach.id)
        .neq("status", "cancelled")
        .gte("starts_at", start)
        .lt("starts_at", end)
        .order("starts_at", { ascending: true }),
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

  const lessonsByDay = new Map<
    string,
    { id: string; coachName: string; status?: string; timeLabel?: string }[]
  >();
  for (const lesson of lessons ?? []) {
    const key = lessonDayKey(lesson.starts_at);
    const list = lessonsByDay.get(key) ?? [];
    list.push({
      id: lesson.id,
      coachName: "課堂",
      status: lesson.status,
      timeLabel: `${formatInTimeZone(lesson.starts_at, TIMEZONE, "HH:mm")}–${formatInTimeZone(lesson.ends_at, TIMEZONE, "HH:mm")}`,
    });
    lessonsByDay.set(key, list);
  }

  const leaveDates = new Set((leaves ?? []).map((leave) => leave.leave_date));
  const shiftLessons = (lessons ?? []).filter(
    (lesson) => lesson.status === "assigned" || lesson.status === "completed",
  );
  const availabilityByDay = new Map<
    string,
    {
      id: string;
      label: string;
      coachName: string;
      timeLabel?: string;
      variant?: "slot" | "leave" | "pending" | "confirmed";
    }[]
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
    const timeLabel = `${formatAvailabilityTime(availability.start_minute)}–${formatAvailabilityTime(availability.end_minute)}`;
    const overlap = overlappingLesson(
      availability.available_date,
      availability.start_minute,
      availability.end_minute,
      shiftLessons,
    );
    const pending = overlap?.status === "assigned";
    const confirmed = overlap?.status === "completed";
    const list = availabilityByDay.get(availability.available_date) ?? [];
    list.push({
      id: availability.id,
      label: timeLabel,
      coachName: coach.full_name,
      timeLabel: formatAvailabilityTime(availability.start_minute),
      variant: pending ? "pending" : confirmed ? "confirmed" : "slot",
    });
    availabilityByDay.set(availability.available_date, list);
  }

  const dayLessons = (lessons ?? []).filter(
    (lesson) => lessonDayKey(lesson.starts_at) === day,
  );
  const pendingDayLessons = dayLessons.filter(
    (lesson) => lesson.status === "assigned",
  );
  const confirmedDayCount = dayLessons.filter(
    (lesson) => lesson.status === "completed",
  ).length;
  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-semibold">我的課堂日曆</h1>
        <CalendarViewToggle
          view={view}
          monthHref={coachCalendarHref({ month, day, week: params.week })}
          weekHref={coachCalendarHref({
            month,
            day,
            week: availabilityWeekStart(day),
            view: "week",
          })}
        />
      </div>

      {view === "month" ? (
      <Panel title="月曆">
        <p className="mb-3 text-sm text-stone-500">
          格內最多顯示兩項。點選日期後，全部詳情在下方。待確認時段可直接確認；確認後才計入薪資。
        </p>
        <MonthCalendar
          month={month}
          selectedDay={day}
          basePath="/coach"
          lessonsByDay={lessonsByDay}
          availabilityByDay={availabilityByDay}
          todayHref={coachCalendarHref({
            month: today.slice(0, 7),
            day: today,
            week: availabilityWeekStart(today),
            hash: "day",
          })}
          dayHref={(target) =>
            coachCalendarHref({
              month: target.slice(0, 7),
              day: target,
              week: availabilityWeekStart(target),
              hash: "day",
            })
          }
          monthHref={(target) => coachCalendarHref({ month: target })}
        />
        <div id="day" className="mt-4 scroll-mt-4 border-t border-stone-100 pt-3">
          <p className="text-sm text-stone-600">
            {day} · 待確認 {pendingDayLessons.length} · 已確認 {confirmedDayCount}
          </p>
          <div className="mt-2 space-y-2">
            {leaveDates.has(day) ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                全日放假
              </div>
            ) : (
              (availabilities ?? [])
                .filter((slot) => slot.available_date === day)
                .map((slot) => {
                  const timeLabel = `${formatAvailabilityTime(slot.start_minute)}–${formatAvailabilityTime(slot.end_minute)}`;
                  const overlap = overlappingLesson(
                    day,
                    slot.start_minute,
                    slot.end_minute,
                    shiftLessons,
                  );
                  const pending = overlap?.status === "assigned";
                  const confirmed = overlap?.status === "completed";
                  const canConfirm =
                    overlap != null && new Date(overlap.starts_at) > now;
                  return (
                    <div
                      key={slot.id}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 ${
                        pending
                          ? "border-amber-200 bg-amber-50"
                          : confirmed
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-sky-200 bg-sky-50"
                      }`}
                    >
                      <p
                        className={`text-sm font-medium tabular-nums ${
                          pending
                            ? "text-amber-950"
                            : confirmed
                              ? "text-emerald-950"
                              : "text-sky-950"
                        }`}
                      >
                        {timeLabel}{" "}
                        {pending ? "待確認" : confirmed ? "已確認" : "可返工"}
                      </p>
                      {pending ? (
                        canConfirm && overlap ? (
                          <ServerActionButton
                            action={confirmLessonAction.bind(null, overlap.id)}
                            confirmMessage="確定接受此派更？確認後才計入薪資。"
                            className="min-h-11 rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-60"
                          >
                            確認派更
                          </ServerActionButton>
                        ) : (
                          <p className="text-sm text-amber-800">
                            已過開始時間，無法確認
                          </p>
                        )
                      ) : null}
                    </div>
                  );
                })
            )}
            {!leaveDates.has(day) &&
            (availabilities ?? []).every(
              (slot) => slot.available_date !== day,
            ) &&
            dayLessons.length === 0 ? (
              <p className="text-sm text-stone-500">這天尚未有可返工或派更</p>
            ) : null}
          </div>
        </div>
      </Panel>
      ) : (
      <section id="availability" className="scroll-mt-4">
        <CoachAvailabilityCalendar
          coachId={coach.id}
          weekParam={params.week}
          month={month}
          day={day}
          view="week"
        />
      </section>
      )}
    </div>
  );
}
