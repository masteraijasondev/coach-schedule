import type { Metadata } from "next";
import { CoachAvailabilityCalendar } from "@/components/coach-availability-calendar";
import { CoachCalendarShell } from "@/components/coach-calendar-shell";
import { requireCoach } from "@/lib/auth";
import {
  availabilityWeekDays,
  hongKongToday,
  monthBoundsIso,
  monthGridDateRange,
  parseAvailabilityWeekParam,
  parseCalendarView,
  parseDayParam,
  parseMonthParam,
} from "@/lib/calendar";
import { nestedStudentId } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ month?: string; day?: string; week?: string; view?: string }>;
};

export async function generateMetadata({}: Props): Promise<Metadata> {
  return {
    title: `我的工作日曆`,
  };
}

export default async function CoachCalendarPage({ searchParams }: Props) {
  const coach = await requireCoach();
  const params = await searchParams;
  const month = parseMonthParam(params.month);
  const day = parseDayParam(params.day, month);
  const today = hongKongToday();
  const view = parseCalendarView(params.view);
  const week = parseAvailabilityWeekParam(params.week ?? day);
  const { start, end } = monthBoundsIso(month);
  const gridRange = monthGridDateRange(month);
  const days = availabilityWeekDays(week);
  const weekInGrid = days.every(
    (date) => date >= gridRange.start && date <= gridRange.end,
  );

  const supabase = await createClient();
  const [
    { data: lessons },
    { data: availabilities },
    { data: leaves },
    { data: workTypeRows },
    { data: staffProfile },
    { data: studentRows },
  ] = await Promise.all([
      supabase
        .from("lessons")
        .select("id, starts_at, ends_at, status, lesson_type_id, lesson_students(student_id)")
        .eq("coach_id", coach.id)
        .neq("status", "cancelled")
        .gte("starts_at", start)
        .lt("starts_at", end)
        .order("starts_at", { ascending: true }),
      supabase
        .from("staff_availabilities")
      .select("id, coach_id, available_date, start_minute, end_minute, released")
        .eq("coach_id", coach.id)
        .gte("available_date", gridRange.start)
        .lte("available_date", gridRange.end)
        .order("start_minute"),
      supabase
        .from("staff_leaves")
        .select("id, coach_id, leave_date, start_minute, end_minute")
        .eq("coach_id", coach.id)
        .gte("leave_date", gridRange.start)
        .lte("leave_date", gridRange.end),
      supabase
        .from("staff_work_types")
        .select("lesson_type_id, lesson_types(id, name, active)")
        .eq("coach_id", coach.id),
      supabase
        .from("profiles")
        .select("staff_kind")
        .eq("id", coach.id)
        .maybeSingle(),
      supabase.from("students").select("id, name").eq("active", true).order("name"),
    ]);

  const workTypes = (workTypeRows ?? [])
    .map((row) => {
      const type = Array.isArray(row.lesson_types)
        ? row.lesson_types[0]
        : row.lesson_types;
      if (!type || !type.active) {
        return null;
      }
      return { id: type.id, name: type.name };
    })
    .filter((type): type is { id: string; name: string } => type != null)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));

  return (
    <CoachCalendarShell
      initialView={view}
      month={month}
      day={day}
      today={today}
      week={week}
      gridStart={gridRange.start}
      gridEnd={gridRange.end}
      coachName={coach.full_name}
      lessons={(lessons ?? []).map((lesson) => ({
        id: lesson.id,
        starts_at: lesson.starts_at,
        ends_at: lesson.ends_at,
        status: lesson.status,
        lesson_type_id: lesson.lesson_type_id,
        student_id: nestedStudentId(lesson),
      }))}
      availabilities={availabilities ?? []}
      leaves={leaves ?? []}
      workTypes={workTypes}
      staffKind={staffProfile?.staff_kind === "operations" ? "operations" : "coach"}
      students={studentRows ?? []}
      remoteWeekCalendar={
        !weekInGrid ? (
          <section id="availability" className="scroll-mt-4">
            <CoachAvailabilityCalendar
              coachId={coach.id}
              weekParam={params.week}
              month={month}
              day={day}
              view="week"
            />
          </section>
        ) : null
      }
    />
  );
}
