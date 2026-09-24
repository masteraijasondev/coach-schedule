"use client";

import {
  cancelLeaveByIdAction,
  deleteAvailabilityAction,
  saveAvailabilityAction,
  saveShortBreakAction,
} from "@/actions/availability";
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
  dayHasLessonOnDate,
  isFullDayLeave,
  lessonDayKey,
  lessonMinutesInHongKong,
  overlappingLesson,
} from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import { pastCheckInEndMinute } from "@/lib/check-in";
import {
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
  students,
}: {
  day: string;
  today: string;
  lessons: CoachDayLesson[];
  availabilities: CoachDaySlot[];
  leaves: CoachDayLeave[];
  workTypes: StaffWorkTypeOption[];
  staffKind: "coach" | "operations";
  students: { id: string; name: string }[];
}) {
  const router = useRouter();
  const now = new Date();
  const nowMinute =
    Number(formatInTimeZone(now, TIMEZONE, "H")) * 60 +
    Number(formatInTimeZone(now, TIMEZONE, "m"));
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
  const shortBreaks = leaves.filter(
    (leave) => leave.leave_date === day && !isFullDayLeave(leave),
  );
  const daySlots = availabilities.filter((slot) => slot.available_date === day);
  const suggestedStart = defaultStartMinute(day, today, now);
  const hasAssigned = dayHasLessonOnDate(day, shiftLessons);
  const canReport = suggestedStart != null && !fullDayLeave;

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
          <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
            全日放假
          </div>
          {suggestedStart != null ? (
            <CancelFullDayLeaveButton date={day} />
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
                label={`${timeLabel} Short Break`}
                tone="leave"
              >
                {editable ? (
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
                        儲存
                      </SubmitButton>
                    </ActionForm>
                    <ServerActionButton
                      action={cancelLeaveByIdAction.bind(null, leave.id)}
                      confirmMessage="確定取消此時段 Short Break？"
                      className="min-h-11 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-800 disabled:opacity-60"
                    >
                      刪除
                    </ServerActionButton>
                  </div>
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
            ).map((segment) => {
              const timeLabel = `${formatAvailabilityTime(segment.startMinute)}–${formatAvailabilityTime(segment.endMinute)}`;
              const pending = segment.lesson?.status === "assigned";
              const confirmed = segment.lesson?.status === "completed";
              const lessonWindow = segment.lesson
                ? lessonMinutesInHongKong(
                    segment.lesson.starts_at,
                    segment.lesson.ends_at,
                  )
                : null;
              const canConfirm =
                lessonWindow != null &&
                pastCheckInEndMinute(
                  lessonWindow.date,
                  lessonWindow.startMinute,
                  lessonWindow.endMinute,
                  today,
                  nowMinute,
                ) != null;
              if (pending) {
                return (
                  <StaffShiftChip
                    key={`${slot.id}-${segment.startMinute}-${segment.endMinute}`}
                    label={`${timeLabel} ${calendarAssignmentLabel("assigned")}`}
                    tone="pending"
                  >
                    {canConfirm && segment.lesson && lessonWindow ? (
                      <LessonCheckInForm
                        lessonId={segment.lesson.id}
                        date={lessonWindow.date}
                        windowStart={lessonWindow.startMinute}
                        windowEnd={lessonWindow.endMinute}
                        workTypes={workTypes}
                        staffKind={staffKind}
                        students={students}
                        initialStudentId={segment.lesson.student_id}
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
                    label={`${timeLabel} ${calendarAssignmentLabel("completed")}`}
                    tone="confirmed"
                  >
                    {segment.lesson && lessonWindow ? (
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
                        initialLessonTypeId={segment.lesson.lesson_type_id}
                        workTypes={workTypes}
                        staffKind={staffKind}
                        students={students}
                        initialStudentId={segment.lesson.student_id}
                        submitLabel="儲存修改"
                      />
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
                          儲存
                        </SubmitButton>
                      </ActionForm>
                      <ServerActionButton
                        action={deleteAvailabilityAction.bind(null, slot.id)}
                        confirmMessage="確定刪除此可返工時段？"
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
