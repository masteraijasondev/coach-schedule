import { EmployerAssignWorkspace } from "@/components/employer-assign-workspace";
import { Panel } from "@/components/ui";
import { availabilityWeekBoundsIso } from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
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

type LeaveSlot = {
  id?: string;
  leave_date: string;
  start_minute?: number | null;
  end_minute?: number | null;
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
  leaves: providedLeaves,
  selectedDay,
  selectedSlot,
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
  leaves?: LeaveSlot[];
  selectedDay?: string;
  selectedSlot?: SlotSelection | null;
  view?: "month" | "week";
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
      .select("id, starts_at, ends_at, status")
      .eq("coach_id", coachId)
      .in("status", ["assigned", "completed"])
      .gte("starts_at", weekStartIso)
      .lt("starts_at", weekEndIso),
  ]);

  availabilityError = slots == null ? availabilityResult.error : null;
  leavesError = leaves == null ? leavesResult.error : null;
  lessonsError = lessonsResult.error;
  slots = slots ?? availabilityResult.data ?? [];
  leaves = leaves ?? leavesResult.data ?? [];
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
          prevWeekHref={prevWeekHref}
          nextWeekHref={nextWeekHref}
          currentWeekHref={currentWeekHref}
          isCurrentWeek={isCurrentWeek}
          slots={slots}
          leaves={leaves}
          lessons={lessons}
          nowMinute={nowMinute}
          view={view}
        />
      )}
    </Panel>
  );
}
