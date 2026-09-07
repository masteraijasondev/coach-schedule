import type { Metadata } from "next";
import { cancelLessonAction } from "@/actions/lessons";
import { CalendarViewToggle } from "@/components/calendar-view-toggle";
import { EmployerAssignForm } from "@/components/employer-assign-form";
import { EmployerAssignPanel } from "@/components/employer-assign-panel";
import { EmployerCoachPicker } from "@/components/employer-coach-picker";
import { MonthCalendar } from "@/components/month-calendar";
import { ServerActionButton } from "@/components/server-action-button";
import { EnsureStudentDirectory } from "@/components/student-directory-provider";
import { Panel } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import {
  availabilityWeekDays,
  availabilityWeekStart,
  hongKongToday,
  lessonDayKey,
  monthBoundsIso,
  monthGridDateRange,
  overlappingLesson,
  parseCalendarView,
  parseAvailabilityWeekParam,
  parseDayParam,
  parseMonthParam,
  payrollPeriodForDate,
  shiftAvailabilityWeek,
} from "@/lib/calendar";
import { employerCalendarHref } from "@/lib/employer-href";
import {
  formatAvailabilityTime,
  formatDateTime,
  formatLessonSizeLabel,
  formatMoneyOrPending,
  lessonStatusLabel,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

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

function nestedStudentName(related: {
  students: { name: string } | { name: string }[] | null;
}): string | null {
  if (!related.students) {
    return null;
  }
  if (Array.isArray(related.students)) {
    return related.students[0]?.name ?? null;
  }
  return related.students.name;
}

function parseMinuteParam(raw?: string): number | null {
  if (raw == null || raw === "") {
    return null;
  }
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

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

  const typeMap = new Map((types ?? []).map((t) => [t.id, t.name]));
  const payModeByType = new Map((types ?? []).map((t) => [t.id, t.pay_mode]));
  const coachMap = new Map((coaches ?? []).map((c) => [c.id, c.full_name]));
  const lessonsByDay = new Map<
    string,
    { id: string; coachName: string; status?: string; timeLabel?: string }[]
  >();
  for (const lesson of lessons ?? []) {
    const key = lessonDayKey(lesson.starts_at);
    const coachName = lesson.coach_id ? coachMap.get(lesson.coach_id) ?? "—" : "—";
    const list = lessonsByDay.get(key) ?? [];
    list.push({
      id: lesson.id,
      coachName,
      status: lesson.status,
      timeLabel: `${formatDateTime(lesson.starts_at).slice(11)}–${formatDateTime(lesson.ends_at).slice(11)}`,
    });
    lessonsByDay.set(key, list);
  }

  const dayLessons = (lessons ?? []).filter(
    (lesson) => lessonDayKey(lesson.starts_at) === day,
  );

  const leaveByCoachDate = new Set(
    (leaves ?? []).map((leave) => `${leave.coach_id}:${leave.leave_date}`),
  );
  const availabilityByDay = new Map<
    string,
    {
      id: string;
      label: string;
      coachName: string;
      timeLabel?: string;
      variant?: "slot" | "leave" | "pending" | "confirmed";
    }[]
  >();
  const shiftLessons = (lessons ?? []).filter(
    (lesson) => lesson.status === "assigned" || lesson.status === "completed",
  );
  for (const leave of leaves ?? []) {
    const coachName = coachMap.get(leave.coach_id) ?? "—";
    const list = availabilityByDay.get(leave.leave_date) ?? [];
    list.push({
      id: leave.id,
      label: `${coachName} 放假`,
      coachName,
      variant: "leave",
    });
    availabilityByDay.set(leave.leave_date, list);
  }
  for (const availability of availabilities ?? []) {
    if (
      leaveByCoachDate.has(
        `${availability.coach_id}:${availability.available_date}`,
      )
    ) {
      continue;
    }
    const coachName = coachMap.get(availability.coach_id) ?? "—";
    const overlap = overlappingLesson(
      availability.available_date,
      availability.start_minute,
      availability.end_minute,
      shiftLessons.filter((lesson) => lesson.coach_id === availability.coach_id),
    );
    const list = availabilityByDay.get(availability.available_date) ?? [];
    list.push({
      id: availability.id,
      label: `${coachName} ${formatAvailabilityTime(availability.start_minute)}–${formatAvailabilityTime(availability.end_minute)}`,
      coachName,
      timeLabel: formatAvailabilityTime(availability.start_minute),
      variant:
        overlap?.status === "assigned"
          ? "pending"
          : overlap?.status === "completed"
            ? "confirmed"
            : "slot",
    });
    availabilityByDay.set(availability.available_date, list);
  }

  const dayAvailabilityByCoach = new Map<
    string,
    {
      coachName: string;
      slots: { id: string; start: number; end: number }[];
    }
  >();
  for (const availability of availabilities ?? []) {
    if (availability.available_date !== day) {
      continue;
    }
    if (leaveByCoachDate.has(`${availability.coach_id}:${day}`)) {
      continue;
    }
    const coachName = coachMap.get(availability.coach_id) ?? "—";
    const existing = dayAvailabilityByCoach.get(availability.coach_id);
    const group = existing ?? {
      coachName,
      slots: [] as { id: string; start: number; end: number }[],
    };
    group.slots.push({
      id: availability.id,
      start: availability.start_minute,
      end: availability.end_minute,
    });
    dayAvailabilityByCoach.set(availability.coach_id, group);
  }
  const dayAvailabilities = [...dayAvailabilityByCoach.entries()].map(
    ([coachId, group]) => ({ coachId, ...group }),
  );
  const dayLeaves = (leaves ?? [])
    .filter((leave) => leave.leave_date === day)
    .map((leave) => ({
      id: leave.id,
      coachId: leave.coach_id,
      coachName: coachMap.get(leave.coach_id) ?? "—",
    }));

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
  const salaryHref = (coachId: string) =>
    `/employer/salary/${coachId}?month=${payrollPeriodForDate(day)}`;
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
  const selectedAssignGroup =
    initialSelection && selectedCoach
      ? dayAvailabilities.find((group) => group.coachId === selectedCoach.id)
      : undefined;
  const showAssignForm =
    initialSelection != null &&
    selectedAssignGroup != null &&
    selectedAssignGroup.slots.some(
      (slot) =>
        slot.start === initialSelection.startMinute &&
        slot.end === initialSelection.slotEndMinute &&
        !overlappingLesson(
          day,
          slot.start,
          slot.end,
          dayLessons.filter((lesson) => lesson.coach_id === selectedCoach?.id),
        ),
    );

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
      <Panel title="月曆">
        <p className="mb-3 text-sm text-stone-500">
          格內最多顯示兩項。點選日期後，全部詳情在下方。員工確認後才計入薪資。
        </p>
        <MonthCalendar
          month={month}
          selectedDay={day}
          basePath="/employer"
          lessonsByDay={lessonsByDay}
          availabilityByDay={availabilityByDay}
          showNames
          todayHref={`${employerCalendarHref({
            month: today.slice(0, 7),
            day: today,
            coach: selectedCoach?.id,
            week: selectedCoach ? availabilityWeekStart(today) : undefined,
          })}#day`}
          monthHref={(target) =>
            employerCalendarHref({
              month: target,
              coach: selectedCoach?.id,
              week,
            })
          }
          dayHref={(target) =>
            `${employerCalendarHref({
              month: target.slice(0, 7),
              day: target,
              coach: selectedCoach?.id,
              week: selectedCoach
                ? availabilityWeekStart(target)
                : week,
            })}#day`
          }
        />
      </Panel>
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

      {view === "week" && showAssignForm && initialSelection && selectedCoach ? (
        <section id="day" className="scroll-mt-4">
          <Panel title="派更">
            <EnsureStudentDirectory />
            <EmployerAssignForm
              coachId={selectedCoach.id}
              coachName={selectedCoach.full_name}
              types={lessonTypes}
              date={initialSelection.date}
              startMinute={initialSelection.startMinute}
              slotEndMinute={initialSelection.slotEndMinute}
              clearHref={employerCalendarHref({
                month,
                day,
                coach: selectedCoach.id,
                week: availabilityWeekStart(day),
                view: "week",
              })}
            />
          </Panel>
        </section>
      ) : null}

      {view === "month" ? (
      <section id="day" className="scroll-mt-4">
        <Panel title={day}>
          <ul className="divide-y divide-stone-100">
            {dayLessons.map((lesson) => {
              const studentNames = (lesson.lesson_students ?? [])
                .map(nestedStudentName)
                .filter((name): name is string => Boolean(name));
              const sizeLabel = formatLessonSizeLabel(
                payModeByType.get(lesson.lesson_type_id),
                lesson.headcount,
                lesson.expected_headcount,
              );
              const pending = lesson.status === "assigned";
              return (
                <li key={lesson.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {typeMap.get(lesson.lesson_type_id) ?? "課堂"} ·{" "}
                        {lessonStatusLabel(lesson.status)}
                      </p>
                      <p className="text-sm tabular-nums text-stone-500">
                        {formatDateTime(lesson.starts_at)} –{" "}
                        {formatDateTime(lesson.ends_at).slice(11)}
                      </p>
                      <p className="text-sm text-stone-500">
                        教練：
                        {lesson.coach_id
                          ? (coachMap.get(lesson.coach_id) ?? "—")
                          : "—"}
                      </p>
                      {studentNames.length > 0 ? (
                        <p className="text-sm text-stone-500">
                          學生：{studentNames.join("、")}
                        </p>
                      ) : null}
                      {sizeLabel ? (
                        <p className="text-sm text-stone-500">{sizeLabel}</p>
                      ) : null}
                      <p
                        className={
                          pending
                            ? "text-sm text-amber-700"
                            : "text-sm text-emerald-700"
                        }
                      >
                        {pending
                          ? "待員工確認後才計薪"
                          : `教練薪資：${formatMoneyOrPending(lesson.earned_amount_hkd)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {lesson.coach_id && !pending ? (
                        <Link
                          href={salaryHref(lesson.coach_id)}
                          className="inline-flex min-h-11 items-center rounded-md border border-stone-300 px-3 py-1.5 text-sm"
                        >
                          改價錢
                        </Link>
                      ) : null}
                      {lesson.status !== "cancelled" ? (
                        <ServerActionButton
                          action={cancelLessonAction.bind(null, lesson.id)}
                          confirmMessage="確定取消此課堂？將不再計入薪資。"
                          className="min-h-11 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:opacity-60"
                        >
                          取消
                        </ServerActionButton>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
            {dayLessons.length === 0 ? (
              <li className="py-3 text-sm text-stone-500">這天尚未有課堂</li>
            ) : null}
          </ul>

          <div className="mt-4 border-t border-stone-100 pt-4">
            <p className="mb-3 text-sm text-stone-500">當日可返工／放假時段；點選可返工即可派更。</p>
            <ul className="divide-y divide-stone-100">
              {dayLeaves.map((leave) => (
                <li key={leave.id} className="py-3">
                  <p className="font-medium">{leave.coachName}</p>
                  <p className="mt-1 text-sm text-rose-800">全日放假</p>
                </li>
              ))}
              {dayAvailabilities.map((group) => {
                const coachDayLessons = dayLessons.filter(
                  (lesson) => lesson.coach_id === group.coachId,
                );
                const selectedSlotOpen =
                  initialSelection != null &&
                  selectedCoach?.id === group.coachId &&
                  group.slots.some(
                    (slot) =>
                      slot.start === initialSelection.startMinute &&
                      slot.end === initialSelection.slotEndMinute &&
                      !overlappingLesson(
                        day,
                        slot.start,
                        slot.end,
                        coachDayLessons,
                      ),
                  );
                return (
                  <li key={group.coachId} className="space-y-3 py-3">
                    <p className="font-medium">{group.coachName}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.slots.map((slot) => {
                        const overlap = overlappingLesson(
                          day,
                          slot.start,
                          slot.end,
                          coachDayLessons,
                        );
                        const selected =
                          selectedCoach?.id === group.coachId &&
                          slotStart === slot.start &&
                          slotEnd === slot.end;
                        if (overlap) {
                          const pending = overlap.status === "assigned";
                          const studentNames = (overlap.lesson_students ?? [])
                            .map(nestedStudentName)
                            .filter((name): name is string => Boolean(name));
                          return (
                            <span
                              key={slot.id}
                              className={`rounded-md px-2 py-2 text-sm ${
                                pending
                                  ? "bg-amber-100 text-amber-950"
                                  : "bg-emerald-100 text-emerald-950"
                              }`}
                            >
                              <span className="tabular-nums">
                                {formatAvailabilityTime(slot.start)}–
                                {formatAvailabilityTime(slot.end)}
                              </span>{" "}
                              {pending ? "待確認" : "已確認"}
                              {typeMap.get(overlap.lesson_type_id)
                                ? ` ·${typeMap.get(overlap.lesson_type_id)}`
                                : ""}
                              {studentNames.length > 0
                                ? ` ·${studentNames.join("、")}`
                                : ""}
                            </span>
                          );
                        }
                        return (
                          <a
                            key={slot.id}
                            href={`${employerCalendarHref({
                              month,
                              day,
                              coach: group.coachId,
                              week: availabilityWeekStart(day),
                              slotStart: slot.start,
                              slotEnd: slot.end,
                            })}#day`}
                            className={`min-h-11 rounded-md border border-dashed px-2 py-2 text-sm tabular-nums ${
                              selected
                                ? "border-stone-900 bg-stone-900 text-white"
                                : "border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100"
                            }`}
                          >
                            {formatAvailabilityTime(slot.start)}–
                            {formatAvailabilityTime(slot.end)} 可返工
                          </a>
                        );
                      })}
                    </div>
                    {selectedSlotOpen && initialSelection ? (
                      <>
                        <EnsureStudentDirectory />
                        <EmployerAssignForm
                          coachId={group.coachId}
                          coachName={group.coachName}
                          types={lessonTypes}
                          date={initialSelection.date}
                          startMinute={initialSelection.startMinute}
                          slotEndMinute={initialSelection.slotEndMinute}
                          clearHref={employerCalendarHref({
                            month,
                            day,
                            coach: group.coachId,
                            week: availabilityWeekStart(day),
                          })}
                        />
                      </>
                    ) : null}
                  </li>
                );
              })}
              {dayLeaves.length === 0 && dayAvailabilities.length === 0 ? (
                <li className="py-3 text-sm text-stone-500">
                  這天尚未有人報可返工或放假
                </li>
              ) : null}
            </ul>
          </div>
        </Panel>
      </section>
      ) : null}
    </div>
  );
}
