import type { Metadata } from "next";
import { CoachAvailabilityCalendar } from "@/components/coach-availability-calendar";
import { CoachCalendarShell } from "@/components/coach-calendar-shell";
import { requireCoach } from "@/lib/auth";
import {
  availabilityWeekDays,
  hongKongToday,
  inclusiveDateRangeBoundsIso,
  monthGridDateRange,
  parseAvailabilityWeekParam,
  parseCalendarView,
  parseDayParam,
  parseMonthParam,
} from "@/lib/calendar";
import { hourlyRateOrNull } from "@/lib/expected-pay";
import { nestedStudentId, nestedStudentNames } from "@/lib/format";
import { loadColleagueSchedules } from "@/lib/load-colleague-schedules";
import { parseCoachScheduleScope } from "@/lib/coach-href";
import { loadStaffCompensation } from "@/lib/staff-compensation";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{
    month?: string;
    day?: string;
    week?: string;
    view?: string;
    scope?: string;
  }>;
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
  const scope = parseCoachScheduleScope(params.scope);
  const week = parseAvailabilityWeekParam(params.week ?? day);
  const gridRange = monthGridDateRange(month);
  const lessonRange = inclusiveDateRangeBoundsIso(
    gridRange.start,
    gridRange.end,
  );
  const days = availabilityWeekDays(week);
  const weekInGrid = days.every(
    (date) => date >= gridRange.start && date <= gridRange.end,
  );
  const scheduleStart = gridRange.start < days[0] ? gridRange.start : days[0];
  const scheduleEnd = gridRange.end > days[6] ? gridRange.end : days[6];
  const teamLessonRange = inclusiveDateRangeBoundsIso(scheduleStart, scheduleEnd);

  const supabase = await createClient();
  const ownPromise = Promise.all([
      supabase
        .from("lessons")
        .select("id, starts_at, ends_at, status, lesson_type_id, lesson_students(student_id, students(name))")
        .eq("coach_id", coach.id)
        .neq("status", "cancelled")
        .gte("starts_at", lessonRange.start)
        .lt("starts_at", lessonRange.end)
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
        .select("id, coach_id, leave_date, start_minute, end_minute, kind")
        .eq("coach_id", coach.id)
        .gte("leave_date", gridRange.start)
        .lte("leave_date", gridRange.end),
      supabase
        .from("staff_work_types")
        .select("lesson_type_id, lesson_types(id, name, active, registers_student, pay_mode)")
        .eq("coach_id", coach.id),
      loadStaffCompensation(coach.id),
      supabase
        .from("coach_rates")
        .select("lesson_type_id, amount_hkd")
        .eq("coach_id", coach.id),
    ]);
  const [own, team] = await Promise.all([
    ownPromise,
    loadColleagueSchedules({
      lessonStart: teamLessonRange.start,
      lessonEnd: teamLessonRange.end,
      gridStart: scheduleStart,
      gridEnd: scheduleEnd,
    }),
  ]);
  const [
    { data: lessons },
    { data: availabilities },
    { data: leaves },
    { data: workTypeRows },
    staffProfile,
    { data: rateRows },
  ] = own;

  const fallbackHourlyRate = hourlyRateOrNull(staffProfile?.hourly_rate_hkd);
  const rateByType = new Map(
    (rateRows ?? []).map((row) => [
      row.lesson_type_id,
      hourlyRateOrNull(row.amount_hkd),
    ]),
  );
  const workTypes = (workTypeRows ?? [])
    .map((row) => {
      const type = Array.isArray(row.lesson_types)
        ? row.lesson_types[0]
        : row.lesson_types;
      if (!type || !type.active) {
        return null;
      }
      const typeRate = rateByType.get(type.id) ?? null;
      return {
        id: type.id,
        name: type.name,
        registersStudent: type.registers_student === true,
        payMode: type.pay_mode,
        hourlyRate:
          type.pay_mode === "per_hour"
            ? (typeRate ?? fallbackHourlyRate)
            : typeRate,
      };
    })
    .filter(
      (
        type,
      ): type is {
        id: string;
        name: string;
        registersStudent: boolean;
        payMode: string;
        hourlyRate: number | null;
      } => type != null,
    )
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
        student_names: nestedStudentNames(lesson),
      }))}
      availabilities={availabilities ?? []}
      leaves={leaves ?? []}
      workTypes={workTypes}
      colleagues={team.colleagues}
      lessonTypes={team.lessonTypes}
      staffKind={staffProfile?.staff_kind === "operations" ? "operations" : "coach"}
      payRatio={hourlyRateOrNull(staffProfile?.pay_ratio)}
      scope={scope}
      remoteWeekCalendar={
        !weekInGrid ? (
          <section id="availability" className="scroll-mt-4">
            <CoachAvailabilityCalendar
              coachId={coach.id}
              weekParam={params.week}
              month={month}
              day={day}
              view="week"
              scope={scope}
            />
          </section>
        ) : null
      }
    />
  );
}
