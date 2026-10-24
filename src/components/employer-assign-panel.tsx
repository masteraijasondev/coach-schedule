import { Alert } from "@/components/alert";
import { EmployerAssignWorkspace } from "@/components/employer-assign-workspace";
import { Panel } from "@/components/ui";
import { availabilityWeekBoundsIso } from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import { groupStudentNames } from "@/lib/employer-calendar-data";
import { createClient } from "@/lib/supabase/server";
import type { PayShift } from "@/lib/expected-pay";
import { formatInTimeZone } from "date-fns-tz";

type AvailabilitySlot = {
  id: string;
  available_date: string;
  start_minute: number;
  end_minute: number;
  released?: boolean;
};

type SlotSelection = {
  date: string;
  startMinute: number;
  slotEndMinute: number;
};

type LeaveSlot = {
  id?: string;
  leave_date: string;
  start_minute?: number | null;
  end_minute?: number | null;
};

type LessonRow = {
  id: string;
  lesson_type_id: string;
  starts_at: string;
  ends_at: string;
  status?: string;
};

type WeekLesson = {
  id: string;
  starts_at: string;
  ends_at: string;
  status?: string;
  lesson_type_name?: string;
  student_names?: string[];
};

type LessonTypeOption = {
  id: string;
  name: string;
};

export async function EmployerAssignPanel({
  coachId,
  coachName,
  month,
  week,
  weekEnd,
  days,
  today,
  prevWeekHref,
  nextWeekHref,
  currentWeekHref,
  isCurrentWeek,
  slots: providedSlots,
  leaves: providedLeaves,
  selectedDay,
  selectedSlot,
  view,
  hourlyRate = null,
  payShifts = [],
  types,
}: {
  coachId: string;
  coachName: string;
  month: string;
  week: string;
  weekEnd: string;
  days: string[];
  today: string;
  prevWeekHref: string;
  nextWeekHref: string;
  currentWeekHref: string;
  isCurrentWeek: boolean;
  slots?: AvailabilitySlot[];
  leaves?: LeaveSlot[];
  selectedDay?: string;
  selectedSlot?: SlotSelection | null;
  view?: "month" | "week";
  hourlyRate?: number | null;
  payShifts?: PayShift[];
  types: LessonTypeOption[];
}) {
  let slots = providedSlots;
  let leaves = providedLeaves;
  let lessons: WeekLesson[] = [];
  let availabilityError = null;
  let leavesError = null;
  let lessonsError = null;

  const now = new Date();
  const nowMinute =
    Number(formatInTimeZone(now, TIMEZONE, "H")) * 60 +
    Number(formatInTimeZone(now, TIMEZONE, "m"));
  const { start: weekStartIso, end: weekEndIso } =
    availabilityWeekBoundsIso(week);
  const supabase = await createClient();
  const [availabilityResult, leavesResult, lessonsResult, namesResult] =
    await Promise.all([
    slots == null
      ? supabase
          .from("staff_availabilities")
          .select("id, available_date, start_minute, end_minute, released")
          .eq("coach_id", coachId)
          .gte("available_date", week)
          .lte("available_date", weekEnd)
          .order("available_date")
          .order("start_minute")
      : Promise.resolve({ data: slots, error: null }),
    leaves == null
      ? supabase
          .from("staff_leaves")
          .select("id, leave_date, start_minute, end_minute")
          .eq("coach_id", coachId)
          .gte("leave_date", week)
          .lte("leave_date", weekEnd)
      : Promise.resolve({ data: leaves, error: null }),
    supabase
      .from("lessons")
      .select("id, lesson_type_id, starts_at, ends_at, status")
      .eq("coach_id", coachId)
      .in("status", ["assigned", "completed"])
      .gte("starts_at", weekStartIso)
      .lt("starts_at", weekEndIso),
    supabase.rpc("employer_calendar_student_names", {
      p_start: weekStartIso,
      p_end: weekEndIso,
    }),
  ]);

  availabilityError = slots == null ? availabilityResult.error : null;
  leavesError = leaves == null ? leavesResult.error : null;
  lessonsError = lessonsResult.error ?? namesResult.error;
  slots = slots ?? availabilityResult.data ?? [];
  leaves = leaves ?? leavesResult.data ?? [];
  const typeNameById = new Map(types.map((type) => [type.id, type.name]));
  const lessonRows = (lessonsResult.data ?? []) as LessonRow[];
  const namesByLesson = groupStudentNames(
    (namesResult.data as { lesson_id: string; student_name: string }[] | null) ??
      null,
  );
  lessons = lessonRows.map((lesson) => ({
    id: lesson.id,
    starts_at: lesson.starts_at,
    ends_at: lesson.ends_at,
    status: lesson.status,
    lesson_type_name: typeNameById.get(lesson.lesson_type_id),
    student_names: namesByLesson.get(lesson.id) ?? [],
  }));

  if (availabilityError || leavesError || lessonsError) {
    console.error("[EmployerAssignPanel] load assign data", {
      error: availabilityError ?? leavesError ?? lessonsError,
      coachId,
      week,
    });
  }

  return (
    <Panel title={`${coachName} 本週可返工`}>
      {availabilityError || leavesError ? (
        <Alert variant="filled" severity="error">無法載入可返工資料</Alert>
      ) : (
        <EmployerAssignWorkspace
          key={`${coachId}-${week}`}
          coachId={coachId}
          coachName={coachName}
          month={month}
          week={week}
          weekEnd={weekEnd}
          days={days}
          today={today}
          selectedDay={selectedDay}
          selectedSlot={selectedSlot}
          prevWeekHref={prevWeekHref}
          nextWeekHref={nextWeekHref}
          currentWeekHref={currentWeekHref}
          isCurrentWeek={isCurrentWeek}
          slots={slots}
          leaves={leaves}
          lessons={lessons}
          nowMinute={nowMinute}
          view={view}
          hourlyRate={hourlyRate}
          payShifts={payShifts}
        />
      )}
    </Panel>
  );
}
