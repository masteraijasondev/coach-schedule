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
import { parseCalendarFilter } from "@/lib/calendar-filter";
import { loadEmployerCalendarData } from "@/lib/employer-calendar-data";
import { employerCalendarHrefWithFilter } from "@/lib/employer-href";

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
    title: `全體員工日曆`,
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
  const slotStart = parseMinuteParam(params.slotStart);
  const slotEnd = parseMinuteParam(params.slotEnd);
  const view = parseCalendarView(params.view);

  const { start, end } = monthBoundsIso(month);
  const gridRange = monthGridDateRange(month);
  const { lessons, types, coaches: staff, availabilities, leaves } =
    await loadEmployerCalendarData({
      lessonStart: start,
      lessonEnd: end,
      gridStart: gridRange.start,
      gridEnd: gridRange.end,
    });
  const initialFilter = parseCalendarFilter(
    { staff: params.staff, status: params.status },
    staff,
  );
  const selectedCoach =
    staff.find((coach) => coach.id === params.coach) ?? null;
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
      lessons={lessons}
      types={types}
      coaches={staff}
      availabilities={availabilities}
      leaves={leaves}
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
