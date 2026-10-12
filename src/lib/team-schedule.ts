import {
  availabilitySegments,
  isFullDayLeave,
  lessonDayKey,
  takeCompletedLessonOnce,
} from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import { checkedInLabel, formatAvailabilityTime, leaveWindowLabel } from "@/lib/format";
import type { LessonStatus } from "@/lib/types";
import { formatInTimeZone } from "date-fns-tz";

export type ColleagueSchedule = {
  id: string;
  fullName: string;
  lessons: {
    id: string;
    starts_at: string;
    ends_at: string;
    status: LessonStatus;
    lesson_type_id: string | null;
  }[];
  availabilities: {
    id: string;
    available_date: string;
    start_minute: number;
    end_minute: number;
    released?: boolean;
  }[];
  leaves: {
    id: string;
    leave_date: string;
    kind?: string | null;
    start_minute?: number | null;
    end_minute?: number | null;
  }[];
};

export type TeamScheduleBar = {
  id: string;
  date: string;
  label: string;
  coachName: string;
  timeLabel?: string;
  variant: "slot" | "leave" | "sick" | "pending" | "confirmed" | "released";
};

export function colleagueScheduleBars(
  colleagues: ColleagueSchedule[],
  typeNameById: Map<string, string>,
): TeamScheduleBar[] {
  const bars: TeamScheduleBar[] = [];
  for (const person of colleagues) {
    bars.push(...barsForPerson(person, typeNameById));
  }
  return bars.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) {
      return byDate;
    }
    const byTime = (a.timeLabel ?? "").localeCompare(b.timeLabel ?? "");
    if (byTime !== 0) {
      return byTime;
    }
    return a.coachName.localeCompare(b.coachName, "zh-Hant");
  });
}

export function teamBarChipLabel(bar: TeamScheduleBar): string {
  if (bar.variant === "leave" || bar.variant === "sick") {
    return bar.label;
  }
  return `${bar.coachName} ${bar.timeLabel ?? bar.label}`;
}

function barsForPerson(
  person: ColleagueSchedule,
  typeNameById: Map<string, string>,
): TeamScheduleBar[] {
  const bars: TeamScheduleBar[] = [];
  const fullLeaveDates = new Set(
    person.leaves.filter(isFullDayLeave).map((leave) => leave.leave_date),
  );
  const shiftLessons = person.lessons.filter(
    (lesson) => lesson.status === "assigned" || lesson.status === "completed",
  );
  const coveredLessonIds = new Set<string>();
  const seenCompleted = new Set<string>();

  for (const leave of person.leaves) {
    const fullDay = isFullDayLeave(leave);
    const time = fullDay
      ? undefined
      : `${formatAvailabilityTime(leave.start_minute ?? 0)}–${formatAvailabilityTime(leave.end_minute ?? 0)}`;
    bars.push({
      id: `team-leave-${leave.id}`,
      date: leave.leave_date,
      label: `${person.fullName} ${leaveWindowLabel(leave)}`,
      coachName: person.fullName,
      timeLabel: time,
      variant: leave.kind === "sick" ? "sick" : "leave",
    });
  }

  for (const availability of person.availabilities) {
    if (fullLeaveDates.has(availability.available_date)) {
      continue;
    }
    if (availability.released) {
      const time = `${formatAvailabilityTime(availability.start_minute)}–${formatAvailabilityTime(availability.end_minute)}`;
      bars.push({
        id: `team-slot-${availability.id}`,
        date: availability.available_date,
        label: time,
        coachName: person.fullName,
        timeLabel: time,
        variant: "released",
      });
      continue;
    }
    for (const segment of availabilitySegments(
      availability.available_date,
      availability.start_minute,
      availability.end_minute,
      shiftLessons,
    )) {
      if (!takeCompletedLessonOnce(segment, seenCompleted)) {
        continue;
      }
      if (segment.lesson) {
        coveredLessonIds.add(segment.lesson.id);
      }
      const pending = segment.lesson?.status === "assigned";
      const confirmed = segment.lesson?.status === "completed";
      const segmentTime = `${formatAvailabilityTime(segment.startMinute)}–${formatAvailabilityTime(segment.endMinute)}`;
      const segmentLabel = confirmed
        ? checkedInLabel({
            time: segmentTime,
            typeName: typeNameById.get(segment.lesson?.lesson_type_id ?? ""),
            withStatus: false,
          })
        : segmentTime;
      bars.push({
        id: `team-slot-${availability.id}-${segment.startMinute}-${segment.endMinute}`,
        date: availability.available_date,
        label: segmentLabel,
        coachName: person.fullName,
        timeLabel: segmentLabel,
        variant: pending ? "pending" : confirmed ? "confirmed" : "slot",
      });
    }
  }

  for (const lesson of shiftLessons) {
    if (coveredLessonIds.has(lesson.id)) {
      continue;
    }
    const date = lessonDayKey(lesson.starts_at);
    const timeLabel = `${formatInTimeZone(lesson.starts_at, TIMEZONE, "HH:mm")}–${formatInTimeZone(lesson.ends_at, TIMEZONE, "HH:mm")}`;
    const confirmed = lesson.status === "completed";
    const label = confirmed
      ? checkedInLabel({
          time: timeLabel,
          typeName: typeNameById.get(lesson.lesson_type_id ?? ""),
          withStatus: false,
        })
      : timeLabel;
    bars.push({
      id: `team-lesson-${lesson.id}`,
      date,
      label,
      coachName: person.fullName,
      timeLabel: label,
      variant: confirmed ? "confirmed" : "pending",
    });
  }

  return bars;
}
