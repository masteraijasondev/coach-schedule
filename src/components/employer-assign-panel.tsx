import { EmployerAssignWorkspace } from "@/components/employer-assign-workspace";
import { Panel } from "@/components/ui";
import type { PayMode } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

type LessonTypeOption = {
  id: string;
  name: string;
  pay_mode: PayMode;
  default_duration_minutes: number;
};

export async function EmployerAssignPanel({
  coachId,
  coachName,
  week,
  weekEnd,
  days,
  today,
  prevWeekHref,
  nextWeekHref,
  currentWeekHref,
  isCurrentWeek,
  types,
}: {
  coachId: string;
  coachName: string;
  week: string;
  weekEnd: string;
  days: string[];
  today: string;
  prevWeekHref: string;
  nextWeekHref: string;
  currentWeekHref: string;
  isCurrentWeek: boolean;
  types: LessonTypeOption[];
}) {
  const supabase = await createClient();
  const [
    { data: availabilities, error: availabilityError },
    { data: leaves, error: leavesError },
    { data: students, error: studentsError },
  ] = await Promise.all([
    supabase
      .from("staff_availabilities")
      .select("id, available_date, start_minute, end_minute")
      .eq("coach_id", coachId)
      .gte("available_date", week)
      .lte("available_date", weekEnd)
      .order("available_date")
      .order("start_minute"),
    supabase
      .from("staff_leaves")
      .select("leave_date")
      .eq("coach_id", coachId)
      .gte("leave_date", week)
      .lte("leave_date", weekEnd),
    supabase
      .from("students")
      .select("id, name")
      .eq("active", true)
      .order("name"),
  ]);

  if (availabilityError || leavesError || studentsError) {
    console.error("[EmployerAssignPanel] load assign data", {
      error: availabilityError ?? leavesError ?? studentsError,
      coachId,
      week,
    });
  }

  return (
    <Panel title={`${coachName} 的可返工`}>
      {availabilityError || leavesError || studentsError ? (
        <p className="text-sm text-red-700" role="alert">
          無法載入可返工資料
        </p>
      ) : (
        <EmployerAssignWorkspace
          coachId={coachId}
          coachName={coachName}
          week={week}
          weekEnd={weekEnd}
          days={days}
          today={today}
          prevWeekHref={prevWeekHref}
          nextWeekHref={nextWeekHref}
          currentWeekHref={currentWeekHref}
          isCurrentWeek={isCurrentWeek}
          slots={availabilities ?? []}
          leaveDates={(leaves ?? []).map((leave) => leave.leave_date)}
          types={types}
          students={students ?? []}
        />
      )}
    </Panel>
  );
}
