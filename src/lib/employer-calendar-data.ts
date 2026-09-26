import { parseStaffKind } from "@/lib/calendar-filter";
import type { EmployerMonthCoach } from "@/components/employer-month-workspace";
import type { EmployerMonthLeave } from "@/components/employer-month-workspace";
import type { EmployerMonthLesson } from "@/components/employer-month-workspace";
import type { EmployerMonthSlot } from "@/components/employer-month-workspace";
import type { EmployerMonthType } from "@/components/employer-month-workspace";
import { createClient } from "@/lib/supabase/server";
import type { LessonStatus, PayMode } from "@/lib/types";

const LESSON_COLUMNS =
  "id, lesson_type_id, coach_id, starts_at, ends_at, status, earned_amount_hkd, student_fee_hkd, headcount, expected_headcount";

type LessonRow = {
  id: string;
  lesson_type_id: string;
  coach_id: string | null;
  starts_at: string;
  ends_at: string;
  status: LessonStatus;
  earned_amount_hkd: number | null;
  student_fee_hkd: number | null;
  headcount: number | null;
  expected_headcount: number | null;
};

function attachStudentNames(
  lessons: LessonRow[],
  names: { lesson_id: string; student_name: string }[] | null,
): EmployerMonthLesson[] {
  const namesByLesson = groupStudentNames(names);
  return lessons.map((lesson) => ({
    ...lesson,
    student_names: namesByLesson.get(lesson.id) ?? [],
  }));
}

export function groupStudentNames(
  names: { lesson_id: string; student_name: string }[] | null,
): Map<string, string[]> {
  const namesByLesson = new Map<string, string[]>();
  for (const row of names ?? []) {
    const list = namesByLesson.get(row.lesson_id) ?? [];
    list.push(row.student_name);
    namesByLesson.set(row.lesson_id, list);
  }
  return namesByLesson;
}

export function relatedStudentName(
  related: { name: string } | { name: string }[] | null | undefined,
): string | null {
  if (!related) {
    return null;
  }
  if (Array.isArray(related)) {
    return related[0]?.name ?? null;
  }
  return related.name;
}

export async function loadEmployerCalendarData(range: {
  lessonStart: string;
  lessonEnd: string;
  gridStart: string;
  gridEnd: string;
}): Promise<{
  lessons: EmployerMonthLesson[];
  types: EmployerMonthType[];
  coaches: EmployerMonthCoach[];
  availabilities: EmployerMonthSlot[];
  leaves: EmployerMonthLeave[];
  workTypes: { coachId: string; id: string; name: string }[];
}> {
  const supabase = await createClient();
  const [
    lessonsResult,
    typesResult,
    availabilitiesResult,
    leavesResult,
    coachesResult,
    namesResult,
    workTypesResult,
  ] = await Promise.all([
    supabase
      .from("lessons")
      .select(LESSON_COLUMNS)
      .neq("status", "cancelled")
      .gte("starts_at", range.lessonStart)
      .lt("starts_at", range.lessonEnd)
      .order("starts_at", { ascending: true }),
    supabase
      .from("lesson_types")
      .select("id, name, default_duration_minutes, pay_mode")
      .eq("active", true)
      .order("name"),
    supabase
      .from("staff_availabilities")
      .select("id, coach_id, available_date, start_minute, end_minute, released")
      .gte("available_date", range.gridStart)
      .lte("available_date", range.gridEnd)
      .order("start_minute"),
    supabase
      .from("staff_leaves")
      .select("id, coach_id, leave_date, start_minute, end_minute, kind")
      .gte("leave_date", range.gridStart)
      .lte("leave_date", range.gridEnd),
    supabase
      .from("profiles")
      .select("id, full_name, staff_kind")
      .eq("role", "coach")
      .order("full_name"),
    supabase.rpc("employer_calendar_student_names", {
      p_start: range.lessonStart,
      p_end: range.lessonEnd,
    }),
    supabase
      .from("staff_work_types")
      .select("coach_id, lesson_type_id, lesson_types(id, name, active)"),
  ]);

  if (lessonsResult.error) {
    console.error("[loadEmployerCalendarData] lessons", {
      error: lessonsResult.error,
    });
  }
  if (availabilitiesResult.error) {
    console.error("[loadEmployerCalendarData] availabilities", {
      error: availabilitiesResult.error,
    });
  }
  if (leavesResult.error) {
    console.error("[loadEmployerCalendarData] leaves", {
      error: leavesResult.error,
    });
  }
  if (namesResult.error) {
    console.error("[loadEmployerCalendarData] student names", {
      error: namesResult.error,
    });
  }

  let coachRows = coachesResult.data;
  if (coachesResult.error) {
    console.error("[loadEmployerCalendarData] coaches", {
      error: coachesResult.error,
    });
    const fallback = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "coach")
      .order("full_name");
    coachRows = (fallback.data ?? []).map((coach) => ({
      id: coach.id,
      full_name: coach.full_name,
      staff_kind: null,
    }));
  }

  const lessonRows = (lessonsResult.data ?? []) as LessonRow[];
  const lessonIds = lessonRows.map((lesson) => lesson.id);
  const { data: lessonStudents, error: lessonStudentsError } = lessonIds.length
    ? await supabase
        .from("lesson_students")
        .select("lesson_id, student_id")
        .in("lesson_id", lessonIds)
    : { data: [], error: null };
  if (lessonStudentsError) {
    console.error("[loadEmployerCalendarData] lesson students", {
      error: lessonStudentsError,
    });
  }
  const studentIdByLesson = new Map<string, string>();
  for (const row of lessonStudents ?? []) {
    if (!studentIdByLesson.has(row.lesson_id)) {
      studentIdByLesson.set(row.lesson_id, row.student_id);
    }
  }
  const lessons = attachStudentNames(
    lessonRows,
    namesResult.data as { lesson_id: string; student_name: string }[] | null,
  ).map((lesson) => ({
    ...lesson,
    student_id: studentIdByLesson.get(lesson.id),
  }));
  const workTypes = (workTypesResult.data ?? [])
    .map((row) => {
      const type = Array.isArray(row.lesson_types)
        ? row.lesson_types[0]
        : row.lesson_types;
      if (!type?.active) {
        return null;
      }
      return { coachId: row.coach_id, id: type.id, name: type.name };
    })
    .filter((type): type is { coachId: string; id: string; name: string } => type != null);
  const types = (typesResult.data ?? []).map((type) => ({
    id: type.id,
    name: type.name,
    pay_mode: type.pay_mode as PayMode,
    default_duration_minutes: type.default_duration_minutes,
  }));
  const coaches = (coachRows ?? []).map((coach) => ({
    id: coach.id,
    full_name: coach.full_name,
    staff_kind: parseStaffKind(
      "staff_kind" in coach ? String(coach.staff_kind) : undefined,
    ),
  }));

  return {
    lessons,
    types,
    coaches,
    availabilities: availabilitiesResult.data ?? [],
    leaves: leavesResult.data ?? [],
    workTypes,
  };
}
