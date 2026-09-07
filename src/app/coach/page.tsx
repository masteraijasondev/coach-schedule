import type { Metadata } from "next";
import { confirmLessonAction } from "@/actions/lessons";
import { CoachAvailabilityCalendar } from "@/components/coach-availability-calendar";
import { MonthCalendar } from "@/components/month-calendar";
import { ServerActionButton } from "@/components/server-action-button";
import { Panel } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import {
  overlappingLesson,
  lessonDayKey,
  monthBoundsIso,
  monthGridDateRange,
  parseDayParam,
  parseMonthParam,
} from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import { formatAvailabilityTime } from "@/lib/format";
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
      coachName: "課堂",
      status: lesson.status,
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
      label: pending
        ? `${timeLabel} ·待確認`
        : confirmed
          ? `${timeLabel} ·已確認`
          : timeLabel,
      coachName: coach.full_name,
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
      <Panel title="我的課堂日曆">
        <p className="mb-3 text-sm text-stone-500">
          琥珀＝待確認，綠色＝已確認。點選待確認時段即可確認派更；確認後才計入薪資。
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

      <Panel title={`${day}`}>
        {dayLessons.length === 0 ? (
          <p className="text-sm text-stone-500">這天尚未有派更</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-stone-600">
              待確認 {pendingDayLessons.length} · 已確認 {confirmedDayCount}
            </p>
            {pendingDayLessons.map((lesson) => {
              const startTime = formatInTimeZone(
                lesson.starts_at,
                TIMEZONE,
                "HH:mm",
              );
              const endTime = formatInTimeZone(lesson.ends_at, TIMEZONE, "HH:mm");
              const canConfirm = new Date(lesson.starts_at) > now;
              return (
                <div
                  key={lesson.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
                >
                  <p className="text-sm font-medium tabular-nums text-amber-950">
                    {startTime}–{endTime} ·待確認
                  </p>
                  {canConfirm ? (
                    <ServerActionButton
                      action={confirmLessonAction.bind(null, lesson.id)}
                      confirmMessage="確定接受此派更？確認後將計入薪資。"
                      className="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white disabled:opacity-60"
                    >
                      確認派更
                    </ServerActionButton>
                  ) : (
                    <p className="text-xs text-amber-800">已過開始時間，無法確認</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
