"use client";

import {
  cancelLeaveByIdAction,
  deleteAvailabilityAction,
  saveAvailabilityAction,
  saveShortBreakAction,
} from "@/actions/availability";
import { undoCheckInAction } from "@/actions/lessons";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { LessonCheckInForm } from "@/components/lesson-check-in-form";
import { CancelFullDayLeaveButton } from "@/components/leave-report-form";
import { ServerActionButton } from "@/components/server-action-button";
import {
  StaffShiftChip,
  StaffShiftComposer,
} from "@/components/staff-shift-composer";
import { Panel, SubmitButton } from "@/components/ui";
import {
  availabilitySegments,
  takeCompletedLessonOnce,
  dayHasLessonOnDate,
  isFullDayLeave,
  lessonDayKey,
  lessonMinutesInHongKong,
  overlappingLesson,
} from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import {
  appendStudentNames,
  calendarAssignmentLabel,
  calendarSlotLabel,
  formatAvailabilityTime,
} from "@/lib/format";
import type { LessonStatus } from "@/lib/types";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { useRouter } from "next/navigation";

const DEFAULT_START_MINUTE = 9 * 60;
const MINUTES_PER_DAY = 1440;

export type CoachDayLesson = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: LessonStatus;
  lesson_type_id?: string;
  student_id?: string;
  student_names?: string[];
};

export type StaffWorkTypeOption = {
  id: string;
  name: string;
};

export type CoachDaySlot = {
  id: string;
  coach_id: string;
  available_date: string;
  start_minute: number;
  end_minute: number;
  released?: boolean;
};

export type CoachDayLeave = {
  id: string;
  leave_date: string;
  start_minute?: number | null;
  end_minute?: number | null;
  kind?: string | null;
};

function availabilityStartsAt(date: string, startMinute: number): Date {
  const hour = String(Math.floor(startMinute / 60)).padStart(2, "0");
  const minute = String(startMinute % 60).padStart(2, "0");
  return fromZonedTime(`${date}T${hour}:${minute}:00`, TIMEZONE);
}

function canEditAvailability(
  availability: CoachDaySlot,
  now: Date,
  locked: boolean,
): boolean {
  if (locked) {
    return false;
  }
  return (
    availabilityStartsAt(
      availability.available_date,
      availability.start_minute,
    ) > now
  );
}

function defaultStartMinute(
  date: string,
  today: string,
  now: Date,
): number | null {
  if (date < today) {
    return null;
  }
  if (date > today) {
    return DEFAULT_START_MINUTE;
  }
  const hour = Number(formatInTimeZone(now, TIMEZONE, "H"));
  const minute = Number(formatInTimeZone(now, TIMEZONE, "m"));
  const nextSlot = (Math.floor((hour * 60 + minute) / 30) + 1) * 30;
  return nextSlot < MINUTES_PER_DAY ? nextSlot : null;
}

export function CoachDayPanel({
  day,
  today,
  lessons,
  availabilities,
  leaves,
  workTypes,
  staffKind,
}: {
  day: string;
  today: string;
  lessons: CoachDayLesson[];
  availabilities: CoachDaySlot[];
  leaves: CoachDayLeave[];
  workTypes: StaffWorkTypeOption[];
  staffKind: "coach" | "operations";
}) {
  const router = useRouter();
  const now = new Date();
  const shiftLessons = lessons.filter(
    (lesson) => lesson.status === "assigned" || lesson.status === "completed",
  );
  const dayLessons = lessons.filter(
    (lesson) => lessonDayKey(lesson.starts_at) === day,
  );
  const pendingCount = dayLessons.filter(
    (lesson) => lesson.status === "assigned",
  ).length;
  const confirmedCount = dayLessons.filter(
    (lesson) => lesson.status === "completed",
  ).length;
  const fullDayLeave = leaves.some(
    (leave) => leave.leave_date === day && isFullDayLeave(leave),
  );
  const fullDaySick = leaves.some(
    (leave) =>
      leave.leave_date === day && leave.kind === "sick" && isFullDayLeave(leave),
  );
  const shortBreaks = leaves.filter(
    (leave) => leave.leave_date === day && !isFullDayLeave(leave),
  );
  const daySlots = availabilities.filter((slot) => slot.available_date === day);
  const suggestedStart = defaultStartMinute(day, today, now);
  const hasAssigned = dayHasLessonOnDate(day, shiftLessons);
  const canReport = suggestedStart != null && !fullDayLeave;
  const seenCompleted = new Set<string>();

  function refresh() {
    router.refresh();
  }

  return (
    <Panel title={day}>
      <p className="text-sm text-stone-600">
        已派更，待簽到 {pendingCount} · 已簽到 {confirmedCount}
      </p>
      {fullDayLeave ? (
        <div className="mt-3 flex flex-col gap-2">
          <div
            className={`rounded-2xl px-4 py-3 text-sm font-medium ${
              fullDaySick
                ? "bg-red-50 text-red-900"
                : "bg-stone-200 text-stone-900"
            }`}
          >
            {fullDaySick ? "全日病假" : "全日放假"}
          </div>
          {day >= today ? (
            <CancelFullDayLeaveButton date={day} sick={fullDaySick} />
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {canReport ? (
            <StaffShiftComposer
              date={day}
              suggestedStart={suggestedStart}
              canTakeFullDay={!hasAssigned}
            />
          ) : null}
          {shortBreaks.map((leave) => {
            const timeLabel = `${formatAvailabilityTime(leave.start_minute ?? 0)}–${formatAvailabilityTime(leave.end_minute ?? 0)}`;
            const editable = suggestedStart != null && Boolean(leave.id);
            return (
              <StaffShiftChip
                key={leave.id}
                label={
                  leave.kind === "sick" ? `${timeLabel} 病假` : `${timeLabel} Short Break`
                }
                tone={leave.kind === "sick" ? "sick" : "leave"}
              >
                {editable && leave.kind !== "sick" ? (
                  <div className="flex flex-col gap-2">
                    <ActionForm
                      action={saveShortBreakAction}
                      className="flex flex-col gap-2"
                      onSuccess={refresh}
                    >
                      <input type="hidden" name="leave_id" value={leave.id} />
                      <input type="hidden" name="leave_date" value={day} />
                      <AvailabilityTimeFields
                        defaultStartMinute={leave.start_minute ?? 0}
                        defaultEndMinute={leave.end_minute ?? 0}
                      />
                      <SubmitButton className="w-full min-w-0">
                        儲存修改
                      </SubmitButton>
                    </ActionForm>
                    <ServerActionButton
                      action={cancelLeaveByIdAction.bind(null, leave.id)}
                      confirmMessage="確定撤銷此時段放假？"
                      confirmLabel="確定撤銷放假"
                      confirmVariant="leaveQuiet"
                      className="min-h-11 rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-800 disabled:opacity-60"
                    >
                      撤銷放假
                    </ServerActionButton>
                  </div>
                ) : day >= today && leave.id ? (
                  <ServerActionButton
                    action={cancelLeaveByIdAction.bind(null, leave.id)}
                    confirmMessage={
                      leave.kind === "sick"
                        ? "確定撤銷此時段病假？"
                        : "確定撤銷此時段放假？"
                    }
                    confirmLabel={
                      leave.kind === "sick" ? "確定撤銷病假" : "確定撤銷放假"
                    }
                    confirmVariant={leave.kind === "sick" ? "sickQuiet" : "leaveQuiet"}
                    className={
                      leave.kind === "sick"
                        ? "min-h-11 rounded-md border border-red-200 px-2 py-1 text-xs text-red-800 disabled:opacity-60"
                        : "min-h-11 rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-800 disabled:opacity-60"
                    }
                  >
                    {leave.kind === "sick" ? "撤銷病假" : "撤銷放假"}
                  </ServerActionButton>
                ) : null}
              </StaffShiftChip>
            );
          })}
          {daySlots.flatMap((slot) => {
            if (slot.released) {
              const timeLabel = `${formatAvailabilityTime(slot.start_minute)}–${formatAvailabilityTime(slot.end_minute)}`;
              return [
                <StaffShiftChip
                  key={slot.id}
                  label={`${timeLabel} ${calendarSlotLabel(true)}`}
                  tone="released"
                />,
              ];
            }
            const locked =
              overlappingLesson(
                day,
                slot.start_minute,
                slot.end_minute,
                shiftLessons,
              ) != null;
            const editable = canEditAvailability(slot, now, locked);
            return availabilitySegments(
              day,
              slot.start_minute,
              slot.end_minute,
              shiftLessons,
            )
              .filter((segment) =>
                takeCompletedLessonOnce(segment, seenCompleted),
              )
              .map((segment) => {
              const timeLabel = `${formatAvailabilityTime(segment.startMinute)}–${formatAvailabilityTime(segment.endMinute)}`;
              const pending = segment.lesson?.status === "assigned";
              const confirmed = segment.lesson?.status === "completed";
              const lessonWindow = segment.lesson
                ? lessonMinutesInHongKong(
                    segment.lesson.starts_at,
                    segment.lesson.ends_at,
                  )
                : null;
              if (pending) {
                return (
                  <StaffShiftChip
                    key={`${slot.id}-${segment.startMinute}-${segment.endMinute}`}
                    label={`${timeLabel} ${calendarAssignmentLabel("assigned")}`}
                    tone="pending"
                  >
                    {segment.lesson && lessonWindow ? (
                      <LessonCheckInForm
                        lessonId={segment.lesson.id}
                        date={lessonWindow.date}
                        windowStart={lessonWindow.startMinute}
                        windowEnd={lessonWindow.endMinute}
                        workTypes={workTypes}
                        staffKind={staffKind}
                      />
                    ) : (
                      <p className="text-sm text-emerald-800">
                        只可簽到已經結束的時段
                      </p>
                    )}
                  </StaffShiftChip>
                );
              }
              if (confirmed) {
                return (
                  <StaffShiftChip
                    key={`${slot.id}-${segment.startMinute}-${segment.endMinute}`}
                    label={appendStudentNames(
                      `${timeLabel} ${calendarAssignmentLabel("completed")}`,
                      segment.lesson?.student_names,
                    )}
                    tone="confirmed"
                  >
                    {segment.lesson && lessonWindow ? (
                      <div className="flex flex-col gap-2">
                        <LessonCheckInForm
                          lessonId={segment.lesson.id}
                          date={lessonWindow.date}
                          windowStart={slot.start_minute}
                          windowEnd={slot.end_minute}
                          initialPeriods={[
                            {
                              startMinute: lessonWindow.startMinute,
                              endMinute: lessonWindow.endMinute,
                            },
                          ]}
                          initialStudentNames={segment.lesson.student_names}
                          initialLessonTypeId={segment.lesson.lesson_type_id}
                          workTypes={workTypes}
                          staffKind={staffKind}
                          submitLabel="儲存修改"
                        />
                        <ServerActionButton
                          action={undoCheckInAction.bind(null, segment.lesson.id)}
                          confirmMessage="確定撤銷簽到？會回到待簽到，本次薪資不會計算。"
                          confirmLabel="確定撤銷簽到"
                          confirmVariant="confirmedQuiet"
                          className="min-h-11 rounded-md border border-sky-200 px-2 py-1 text-xs text-sky-900 disabled:opacity-60"
                        >
                          撤銷簽到
                        </ServerActionButton>
                      </div>
                    ) : null}
                  </StaffShiftChip>
                );
              }
              return (
                <StaffShiftChip
                  key={`${slot.id}-${segment.startMinute}-${segment.endMinute}`}
                  label={`${timeLabel} ${calendarSlotLabel()}`}
                  tone="slot"
                >
                  {editable ? (
                    <div className="flex flex-col gap-2">
                      <ActionForm
                        action={saveAvailabilityAction}
                        className="flex flex-col gap-2"
                        onSuccess={refresh}
                      >
                        <input
                          type="hidden"
                          name="availability_id"
                          value={slot.id}
                        />
                        <input
                          type="hidden"
                          name="available_date"
                          value={day}
                        />
                        <AvailabilityTimeFields
                          defaultStartMinute={slot.start_minute}
                          defaultEndMinute={slot.end_minute}
                        />
                        <SubmitButton className="w-full min-w-0">
                          儲存可返工時間
                        </SubmitButton>
                      </ActionForm>
                      <ServerActionButton
                        action={deleteAvailabilityAction.bind(null, slot.id)}
                        confirmMessage="確定刪除此可返工時段？"
                        confirmLabel="確定刪除"
                        confirmVariant="danger"
                        className="min-h-11 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-60"
                      >
                        刪除
                      </ServerActionButton>
                    </div>
                  ) : null}
                </StaffShiftChip>
              );
            });
          })}
          {shortBreaks.length === 0 &&
          daySlots.length === 0 &&
          dayLessons.length === 0 &&
          !canReport ? (
            <p className="text-sm text-stone-500">當日尚未有可返工或派更</p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
