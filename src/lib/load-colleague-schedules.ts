import { requireCoach } from "@/lib/auth";
import type { ColleagueSchedule } from "@/lib/team-schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LessonStatus } from "@/lib/types";

const PAGE_SIZE = 500;

const EMPTY: {
  colleagues: ColleagueSchedule[];
  lessonTypes: { id: string; name: string }[];
} = { colleagues: [], lessonTypes: [] };

async function selectAll<T>(
  label: string,
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`[loadColleagueSchedules] ${label}`, { error });
      break;
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) {
      break;
    }
  }
  return rows;
}

export async function loadColleagueSchedules(range: {
  lessonStart: string;
  lessonEnd: string;
  gridStart: string;
  gridEnd: string;
}): Promise<{
  colleagues: ColleagueSchedule[];
  lessonTypes: { id: string; name: string }[];
}> {
  const coach = await requireCoach();
  try {
    // Staff RLS only returns the signed-in person's rows. This read uses the
    // service role after the coach check, and selects schedule fields only.
    const admin = createAdminClient();
    const [staffRows, lessonRows, availabilityRows, leaveRows, typeRows] = await Promise.all([
      selectAll("profiles", (from, to) =>
        admin
          .from("profiles")
          .select("id, full_name")
          .eq("role", "coach")
          .eq("active", true)
          .neq("id", coach.id)
          .order("full_name")
          .range(from, to),
      ),
      selectAll("lessons", (from, to) =>
        admin
          .from("lessons")
          .select("id, coach_id, lesson_type_id, starts_at, ends_at, status")
          .in("status", ["assigned", "completed"])
          .gte("starts_at", range.lessonStart)
          .lt("starts_at", range.lessonEnd)
          .order("starts_at", { ascending: true })
          .range(from, to),
      ),
      selectAll("availabilities", (from, to) =>
        admin
          .from("staff_availabilities")
          .select("id, coach_id, available_date, start_minute, end_minute, released")
          .gte("available_date", range.gridStart)
          .lte("available_date", range.gridEnd)
          .order("start_minute")
          .range(from, to),
      ),
      selectAll("leaves", (from, to) =>
        admin
          .from("staff_leaves")
          .select("id, coach_id, leave_date, kind, start_minute, end_minute")
          .gte("leave_date", range.gridStart)
          .lte("leave_date", range.gridEnd)
          .range(from, to),
      ),
      selectAll("lesson types", (from, to) =>
        admin.from("lesson_types").select("id, name").range(from, to),
      ),
    ]);

    const colleagues = new Map<string, ColleagueSchedule>();
    for (const row of staffRows) {
      const fullName = row.full_name?.trim() || "未命名";
      colleagues.set(row.id, {
        id: row.id,
        fullName,
        lessons: [],
        availabilities: [],
        leaves: [],
      });
    }

    for (const lesson of lessonRows) {
      const person = lesson.coach_id ? colleagues.get(lesson.coach_id) : undefined;
      if (!person || !isShiftStatus(lesson.status)) {
        continue;
      }
      person.lessons.push({
        id: lesson.id,
        starts_at: lesson.starts_at,
        ends_at: lesson.ends_at,
        status: lesson.status,
        lesson_type_id: lesson.lesson_type_id,
      });
    }

    for (const slot of availabilityRows) {
      const person = colleagues.get(slot.coach_id);
      if (!person) {
        continue;
      }
      person.availabilities.push({
        id: slot.id,
        available_date: slot.available_date,
        start_minute: slot.start_minute,
        end_minute: slot.end_minute,
        released: slot.released === true,
      });
    }

    for (const leave of leaveRows) {
      const person = colleagues.get(leave.coach_id);
      if (!person) {
        continue;
      }
      person.leaves.push({
        id: leave.id,
        leave_date: leave.leave_date,
        kind: leave.kind,
        start_minute: leave.start_minute,
        end_minute: leave.end_minute,
      });
    }

    return {
      colleagues: [...colleagues.values()].sort((a, b) =>
        a.fullName.localeCompare(b.fullName, "zh-Hant"),
      ),
      lessonTypes: typeRows.map((type) => ({
        id: type.id,
        name: type.name,
      })),
    };
  } catch (error) {
    console.error("[loadColleagueSchedules]", { error, coachId: coach.id });
    return EMPTY;
  }
}

function isShiftStatus(status: string): status is Extract<LessonStatus, "assigned" | "completed"> {
  return status === "assigned" || status === "completed";
}
