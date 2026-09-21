import { CoachWeekCalendar } from "@/components/coach-week-calendar";
import {
  availabilityWeekBoundsIso,
  availabilityWeekDays,
  parseAvailabilityWeekParam,
  type CalendarView,
} from "@/lib/calendar";
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
      .select("id, coach_id, leave_date, start_minute, end_minute")
      .eq("coach_id", coachId)
      .gte("leave_date", week)
      .lte("leave_date", weekEnd),
    supabase
      .from("lessons")
      .select("id, starts_at, ends_at, status")
      .eq("coach_id", coachId)
      .in("status", ["assigned", "completed"])
      .gte("starts_at", weekStartIso)
      .lt("starts_at", weekEndIso),
  ]);

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
      lessons={lessons ?? []}
      loadError={Boolean(error || leavesError)}
    />
  );
}
