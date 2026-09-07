import { EmployerAssignWorkspace } from "@/components/employer-assign-workspace";
import { Panel } from "@/components/ui";
import { availabilityWeekBoundsIso } from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { PayMode } from "@/lib/types";
import { formatInTimeZone } from "date-fns-tz";

type AvailabilitySlot = {
  id: string;
  available_date: string;
  start_minute: number;
  end_minute: number;
};

type SlotSelection = {
  date: string;
  startMinute: number;
  slotEndMinute: number;
};

type WeekLesson = {
  id: string;
  starts_at: string;
  ends_at: string;
  status?: string;
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
  leaveDates: providedLeaveDates,
  selectedDay,
  selectedSlot,
  types,
  view,
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
  leaveDates?: string[];
  selectedDay?: string;
  selectedSlot?: SlotSelection | null;
  types: {
    id: string;
    name: string;
    pay_mode: PayMode;
    default_duration_minutes: number;
  }[];
  view?: "month" | "week";
}) {
  let slots = providedSlots;
  let leaveDates = providedLeaveDates;
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
  const [availabilityResult, leavesResult, lessonsResult] = await Promise.all([
    slots == null
      ? supabase
          .from("staff_availabilities")
          .select("id, available_date, start_minute, end_minute")
          .eq("coach_id", coachId)
          .gte("available_date", week)
          .lte("available_date", weekEnd)
          .order("available_date")
          .order("start_minute")
      : Promise.resolve({ data: slots, error: null }),
    leaveDates == null
      ? supabase
          .from("staff_leaves")
          .select("leave_date")
          .eq("coach_id", coachId)
          .gte("leave_date", week)
          .lte("leave_date", weekEnd)
      : Promise.resolve({
          data: leaveDates.map((leave_date) => ({ leave_date })),
          error: null,
        }),
    supabase
      .from("lessons")
      .select("id, starts_at, ends_at, status")
      .eq("coach_id", coachId)
      .in("status", ["assigned", "completed"])
      .gte("starts_at", weekStartIso)
      .lt("starts_at", weekEndIso),
  ]);

  availabilityError = slots == null ? availabilityResult.error : null;
  leavesError = leaveDates == null ? leavesResult.error : null;
  lessonsError = lessonsResult.error;
  slots = slots ?? availabilityResult.data ?? [];
  leaveDates =
    leaveDates ??
    (leavesResult.data ?? []).map((leave) => leave.leave_date);
  lessons = lessonsResult.data ?? [];

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
        <p className="text-sm text-red-700" role="alert">
          無法載入可返工資料
        </p>
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
          types={types}
          prevWeekHref={prevWeekHref}
          nextWeekHref={nextWeekHref}
          currentWeekHref={currentWeekHref}
          isCurrentWeek={isCurrentWeek}
          slots={slots}
          leaveDates={leaveDates}
          lessons={lessons}
          nowMinute={nowMinute}
          view={view}
        />
      )}
    </Panel>
  );
}
