"use client";

import {
  cancelLeaveByIdAction,
  deleteAvailabilityAction,
  saveAvailabilityAction,
} from "@/actions/availability";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { LessonCheckInForm } from "@/components/lesson-check-in-form";
import {
  CancelFullDayLeaveButton,
  LeaveReportForm,
} from "@/components/leave-report-form";
import { ServerActionButton } from "@/components/server-action-button";
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
import {
  calendarAssignmentLabel,
  formatAvailabilityTime,
  leaveWindowLabel,
} from "@/lib/format";
import type { LessonStatus } from "@/lib/types";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { useRouter } from "next/navigation";

const DEFAULT_START_MINUTE = 9 * 60;
const DEFAULT_DURATION_MINUTES = 60;
const MINUTES_PER_DAY = 1440;

export type CoachDayLesson = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: LessonStatus;
};

export type CoachDaySlot = {
  id: string;
  coach_id: string;
  available_date: string;
  start_minute: number;
  end_minute: number;
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
}: {
  day: string;
  today: string;
  lessons: CoachDayLesson[];
  availabilities: CoachDaySlot[];
  leaves: CoachDayLeave[];
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
        待確認 {pendingCount} · 已確認簽到 {confirmedCount}
      </p>
      {fullDayLeave ? (
        <div className="mt-3 space-y-2">
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            全日放假
          </div>
          {suggestedStart != null ? (
            <CancelFullDayLeaveButton date={day} />
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {canReport ? (
            <div className="rounded-md border border-dashed border-sky-200 bg-sky-50 p-3">
              <p className="mb-2 text-sm font-medium text-sky-950">報可返工</p>
              <ActionForm
                action={saveAvailabilityAction}
                className="space-y-2"
                onSuccess={refresh}
              >
                <input type="hidden" name="available_date" value={day} />
                <AvailabilityTimeFields
                  defaultStartMinute={suggestedStart}
                  defaultEndMinute={Math.min(
                    suggestedStart + DEFAULT_DURATION_MINUTES,
                    MINUTES_PER_DAY,
                  )}
                />
                <SubmitButton>新增</SubmitButton>
              </ActionForm>
              <div className="mt-2">
                <LeaveReportForm
                  date={day}
                  suggestedStart={suggestedStart}
                  canTakeFullDay={!hasAssigned}
                />
              </div>
            </div>
          ) : null}
          {shortBreaks.map((leave) => (
            <div
              key={leave.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
            >
              <p>{leaveWindowLabel(leave)}</p>
              {suggestedStart != null && leave.id ? (
                <ServerActionButton
                  action={cancelLeaveByIdAction.bind(null, leave.id)}
                  confirmMessage="確定取消此時段 Short Break？"
                  className="min-h-11 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-800 disabled:opacity-60"
                >
                  刪除
                </ServerActionButton>
              ) : null}
            </div>
          ))}
          {daySlots.flatMap((slot) => {
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
              const canConfirm =
                segment.lesson != null &&
                new Date(segment.lesson.starts_at) > now;
              const lessonWindow = segment.lesson
                ? lessonMinutesInHongKong(
                    segment.lesson.starts_at,
                    segment.lesson.ends_at,
                  )
                : null;
              return (
                <div
                  key={`${slot.id}-${segment.startMinute}-${segment.endMinute}`}
                  className={`space-y-2 rounded-md border px-3 py-2 ${
                    pending
                      ? "border-amber-200 bg-amber-50"
                      : confirmed
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-sky-200 bg-sky-50"
                  }`}
                >
                  <p
                    className={`text-sm font-medium tabular-nums ${
                      pending
                        ? "text-amber-950"
                        : confirmed
                          ? "text-emerald-950"
                          : "text-sky-950"
                    }`}
                  >
                    {timeLabel}{" "}
                    {pending
                      ? calendarAssignmentLabel("assigned")
                      : confirmed
                        ? calendarAssignmentLabel("completed")
                        : "可返工"}
                  </p>
                  {pending ? (
                    canConfirm && segment.lesson && lessonWindow ? (
                      <LessonCheckInForm
                        lessonId={segment.lesson.id}
                        windowStart={lessonWindow.startMinute}
                        windowEnd={lessonWindow.endMinute}
                      />
                    ) : (
                      <p className="text-sm text-amber-800">
                        已過開始時間，無法確認
                      </p>
                    )
                  ) : null}
                  {!pending && !confirmed && editable ? (
                    <div className="space-y-2">
                      <ActionForm
                        action={saveAvailabilityAction}
                        className="space-y-2"
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
                        <SubmitButton>儲存</SubmitButton>
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
                </div>
              );
            });
          })}
          {shortBreaks.length === 0 &&
          daySlots.length === 0 &&
          dayLessons.length === 0 ? (
            <p className="text-sm text-stone-500">
              {canReport
                ? "這天尚未有可返工或派更。可在上方報可返工。"
                : "這天尚未有可返工或派更"}
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
