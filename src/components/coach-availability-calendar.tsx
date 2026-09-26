import { CoachWeekCalendar } from "@/components/coach-week-calendar";
import {
  availabilityWeekBoundsIso,
  availabilityWeekDays,
  parseAvailabilityWeekParam,
  type CalendarView,
} from "@/lib/calendar";
import { nestedStudentId } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export async function CoachAvailabilityCalendar({
  coachId,
  weekParam,
  month,
  day,
  view,
}: {
  coachId: string;
  weekParam?: string;
  month: string;
  day: string;
  view?: CalendarView;
}) {
  const week = parseAvailabilityWeekParam(weekParam);
  const days = availabilityWeekDays(week);
  const weekEnd = days[6];
  const { start: weekStartIso, end: weekEndIso } =
    availabilityWeekBoundsIso(week);
  const supabase = await createClient();
  const [
    { data: availabilities, error },
    { data: leaves, error: leavesError },
    { data: lessons },
    { data: workTypeRows },
    { data: staffProfile },
  ] = await Promise.all([
    supabase
      .from("staff_availabilities")
      .select("id, coach_id, available_date, start_minute, end_minute, released")
      .eq("coach_id", coachId)
      .gte("available_date", week)
      .lte("available_date", weekEnd)
      .order("available_date")
      .order("start_minute"),
    supabase
      .from("staff_leaves")
      .select("id, coach_id, leave_date, start_minute, end_minute, kind")
      .eq("coach_id", coachId)
      .gte("leave_date", week)
      .lte("leave_date", weekEnd),
    supabase
      .from("lessons")
      .select("id, starts_at, ends_at, status, lesson_type_id, lesson_students(student_id)")
      .eq("coach_id", coachId)
      .in("status", ["assigned", "completed"])
      .gte("starts_at", weekStartIso)
      .lt("starts_at", weekEndIso),
    supabase
      .from("staff_work_types")
      .select("lesson_type_id, lesson_types(id, name, active)")
      .eq("coach_id", coachId),
    supabase
      .from("profiles")
      .select("staff_kind")
      .eq("id", coachId)
      .maybeSingle(),
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

  if (error || leavesError) {
    console.error("[CoachAvailabilityCalendar] load availability", {
      error,
      leavesError,
      coachId,
      week,
    });
  }

  return (
    <CoachWeekCalendar
      week={week}
      month={month}
      day={day}
      view={view}
      availabilities={availabilities ?? []}
      leaves={leaves ?? []}
      lessons={(lessons ?? []).map((lesson) => ({
        id: lesson.id,
        starts_at: lesson.starts_at,
        ends_at: lesson.ends_at,
        status: lesson.status,
        lesson_type_id: lesson.lesson_type_id,
        student_id: nestedStudentId(lesson),
      }))}
      workTypes={workTypes}
      staffKind={staffProfile?.staff_kind === "operations" ? "operations" : "coach"}
      loadError={Boolean(error || leavesError)}
    />
  );
}
