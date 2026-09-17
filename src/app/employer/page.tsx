import type { Metadata } from "next";
import { EmployerAssignPanel } from "@/components/employer-assign-panel";
import { EmployerCalendarShell } from "@/components/employer-calendar-shell";
import { requireEmployer } from "@/lib/auth";
import {
  availabilityWeekDays,
  availabilityWeekStart,
  hongKongToday,
  monthBoundsIso,
  monthGridDateRange,
  parseCalendarView,
  parseAvailabilityWeekParam,
  parseDayParam,
  parseMinuteParam,
  parseMonthParam,
  shiftAvailabilityWeek,
} from "@/lib/calendar";
import { parseCalendarFilter, parseStaffKind } from "@/lib/calendar-filter";
import { employerCalendarHrefWithFilter } from "@/lib/employer-href";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{
    month?: string;
    day?: string;
    coach?: string;
    week?: string;
    view?: string;
    slotStart?: string;
    slotEnd?: string;
    staff?: string;
    status?: string;
  }>;
};

export async function generateMetadata({}: Props): Promise<Metadata> {
  return {
    title: `全體教練日曆`,
  };
}

export default async function EmployerHomePage({ searchParams }: Props) {
  await requireEmployer();
  const params = await searchParams;
  const month = parseMonthParam(params.month);
  const day = parseDayParam(params.day, month);
  const today = hongKongToday();
  const week = parseAvailabilityWeekParam(params.week ?? day);
  const currentWeek = availabilityWeekStart();
  const days = availabilityWeekDays(week);
  const weekEnd = days[6];
  const prevWeek = shiftAvailabilityWeek(week, -1);
  const nextWeek = shiftAvailabilityWeek(week, 1);
  const { start, end } = monthBoundsIso(month);
  const gridRange = monthGridDateRange(month);
  const slotStart = parseMinuteParam(params.slotStart);
  const slotEnd = parseMinuteParam(params.slotEnd);
  const view = parseCalendarView(params.view);

  const supabase = await createClient();
  const [
    { data: lessons },
    { data: types },
    { data: availabilities },
    { data: leaves },
  ] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        "id, lesson_type_id, coach_id, starts_at, ends_at, status, earned_amount_hkd, student_fee_hkd, headcount, expected_headcount, lesson_students ( students ( name ) )",
      )
      .neq("status", "cancelled")
      .gte("starts_at", start)
      .lt("starts_at", end)
      .order("starts_at", { ascending: true }),
    supabase
      .from("lesson_types")
      .select("id, name, default_duration_minutes, pay_mode")
      .eq("active", true)
      .order("name"),
    supabase
      .from("staff_availabilities")
      .select("id, coach_id, available_date, start_minute, end_minute")
      .gte("available_date", gridRange.start)
      .lte("available_date", gridRange.end)
      .order("start_minute"),
    supabase
      .from("staff_leaves")
      .select("id, coach_id, leave_date, start_minute, end_minute")
      .gte("leave_date", gridRange.start)
      .lte("leave_date", gridRange.end),
  ]);
  // staff_kind comes from 017; keep the calendar usable until that migration is applied.
  const coachesResult = await supabase
    .from("profiles")
    .select("id, full_name, staff_kind")
    .eq("role", "coach")
    .order("full_name");
  const coaches =
    coachesResult.error == null
      ? coachesResult.data
      : (
          await supabase
            .from("profiles")
            .select("id, full_name")
            .eq("role", "coach")
            .order("full_name")
        ).data;

  const staff = (coaches ?? []).map((coach) => ({
    id: coach.id,
    full_name: coach.full_name,
    staff_kind: parseStaffKind(
      "staff_kind" in coach ? String(coach.staff_kind) : undefined,
    ),
  }));
  const initialFilter = parseCalendarFilter(
    { staff: params.staff, status: params.status },
    staff,
  );
  const selectedCoach =
    staff.find((coach) => coach.id === params.coach) ?? null;
  const lessonTypes = (types ?? []).map((type) => ({
    id: type.id,
    name: type.name,
    pay_mode: type.pay_mode,
    default_duration_minutes: type.default_duration_minutes,
  }));
  const weekInGrid = days.every(
    (date) => date >= gridRange.start && date <= gridRange.end,
  );
  const assignSlots =
    selectedCoach && weekInGrid
      ? (availabilities ?? []).filter(
          (slot) =>
            slot.coach_id === selectedCoach.id &&
            slot.available_date >= week &&
            slot.available_date <= weekEnd,
        )
      : undefined;
  const initialSelection =
    selectedCoach && slotStart != null && slotEnd != null
      ? { date: day, startMinute: slotStart, slotEndMinute: slotEnd }
      : null;

  return (
    <EmployerCalendarShell
      initialView={view}
      month={month}
      day={day}
      today={today}
      week={week}
      gridStart={gridRange.start}
      gridEnd={gridRange.end}
      coachId={selectedCoach?.id}
      slotStart={slotStart}
      slotEnd={slotEnd}
      lessons={lessons ?? []}
      types={lessonTypes}
      coaches={staff}
      availabilities={availabilities ?? []}
      leaves={leaves ?? []}
      initialFilter={initialFilter}
      remoteWeekPanel={
        selectedCoach && !weekInGrid ? (
          <EmployerAssignPanel
            coachId={selectedCoach.id}
            coachName={selectedCoach.full_name}
            month={month}
            week={week}
            weekEnd={weekEnd}
            days={days}
            today={today}
            selectedDay={day}
            selectedSlot={initialSelection}
            prevWeekHref={employerCalendarHrefWithFilter(
              {
                month,
                day,
                coach: selectedCoach.id,
                week: prevWeek,
                view: "week",
              },
              initialFilter,
              staff,
            )}
            nextWeekHref={employerCalendarHrefWithFilter(
              {
                month,
                day,
                coach: selectedCoach.id,
                week: nextWeek,
                view: "week",
              },
              initialFilter,
              staff,
            )}
            currentWeekHref={employerCalendarHrefWithFilter(
              {
                month,
                day,
                coach: selectedCoach.id,
                week: currentWeek,
                view: "week",
              },
              initialFilter,
              staff,
            )}
            isCurrentWeek={week === currentWeek}
            slots={assignSlots}
            view="week"
          />
        ) : null
      }
    />
  );
}
