import type { Metadata } from "next";
import { CalendarViewToggle } from "@/components/calendar-view-toggle";
import { EmployerAssignPanel } from "@/components/employer-assign-panel";
import { EmployerCoachPicker } from "@/components/employer-coach-picker";
import { EmployerMonthWorkspace } from "@/components/employer-month-workspace";
import { Panel } from "@/components/ui";
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
import { employerCalendarHref } from "@/lib/employer-href";
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
    { data: coaches },
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
      .from("profiles")
      .select("id, full_name")
      .eq("role", "coach")
      .order("full_name"),
    supabase
      .from("staff_availabilities")
      .select("id, coach_id, available_date, start_minute, end_minute")
      .gte("available_date", gridRange.start)
      .lte("available_date", gridRange.end)
      .order("start_minute"),
    supabase
      .from("staff_leaves")
      .select("id, coach_id, leave_date")
      .gte("leave_date", gridRange.start)
      .lte("leave_date", gridRange.end),
  ]);

  const selectedCoach =
    (coaches ?? []).find((coach) => coach.id === params.coach) ?? null;
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
  const assignLeaveDates =
    selectedCoach && weekInGrid
      ? (leaves ?? [])
          .filter(
            (leave) =>
              leave.coach_id === selectedCoach.id &&
              leave.leave_date >= week &&
              leave.leave_date <= weekEnd,
          )
          .map((leave) => leave.leave_date)
      : undefined;
  const initialSelection =
    selectedCoach && slotStart != null && slotEnd != null
      ? { date: day, startMinute: slotStart, slotEndMinute: slotEnd }
      : null;
  const monthViewHref = employerCalendarHref({
    month,
    day,
    coach: selectedCoach?.id,
    week,
  });
  const weekViewHref = employerCalendarHref({
    month,
    day,
    coach: selectedCoach?.id,
    week: availabilityWeekStart(day),
    view: "week",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-semibold">全體教練日曆</h1>
        <CalendarViewToggle
          view={view}
          monthHref={monthViewHref}
          weekHref={weekViewHref}
        />
      </div>

      {view === "month" ? (
        <EmployerMonthWorkspace
          key={month}
          month={month}
          day={day}
          today={today}
          week={week}
          coachId={selectedCoach?.id}
          slotStart={slotStart}
          slotEnd={slotEnd}
          lessons={lessons ?? []}
          types={lessonTypes}
          coaches={coaches ?? []}
          availabilities={availabilities ?? []}
          leaves={leaves ?? []}
        />
      ) : (
        <Panel title="週曆">
          <p className="mb-3 text-sm text-stone-500">
            選擇員工查看本週可返工。點選時段即可派更。
          </p>
          <EmployerCoachPicker
            coaches={coaches ?? []}
            selectedCoachId={selectedCoach?.id}
            month={month}
            day={day}
            week={week}
            view={view}
          />
        </Panel>
      )}

      {view === "week" && selectedCoach ? (
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
          types={lessonTypes}
          prevWeekHref={employerCalendarHref({
            month,
            day,
            coach: selectedCoach.id,
            week: prevWeek,
            view: "week",
          })}
          nextWeekHref={employerCalendarHref({
            month,
            day,
            coach: selectedCoach.id,
            week: nextWeek,
            view: "week",
          })}
          currentWeekHref={employerCalendarHref({
            month,
            day,
            coach: selectedCoach.id,
            week: currentWeek,
            view: "week",
          })}
          isCurrentWeek={week === currentWeek}
          slots={assignSlots}
          leaveDates={assignLeaveDates}
          view="week"
        />
      ) : null}
    </div>
  );
}
