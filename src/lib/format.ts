import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE, CURRENCY_LABEL } from "@/lib/constants";
import type { LessonStatus, PayMode, RequestStatus } from "@/lib/types";

export function nestedStudentName(related: {
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

export function formatDateTime(iso: string): string {
  return formatInTimeZone(iso, TIMEZONE, "yyyy-MM-dd HH:mm");
}

export function formatDate(iso: string): string {
  return formatInTimeZone(iso, TIMEZONE, "yyyy-MM-dd");
}

export function formatMoney(amount: number): string {
  return `${CURRENCY_LABEL} $${Number(amount).toFixed(2)}`;
}

export function formatMoneyOrPending(
  amount: number | null | undefined,
): string {
  if (amount == null) {
    return "尚未填寫";
  }
  return formatMoney(Number(amount));
}

export function formatLessonSizeLabel(
  payMode: PayMode | undefined,
  actual: number | null | undefined,
  expected: number | null | undefined,
): string | null {
  if (payMode === "per_student") {
    if (actual === 1 || actual === 2 || actual === 3) {
      return `形式：1:${actual}`;
    }
    return null;
  }
  if (payMode === "per_head") {
    const label = formatHeadcount(actual, expected);
    return label ? `人數：${label}` : null;
  }
  return null;
}

export function formatAvailabilityTime(minutes: number): string {
  if (minutes === 1440) {
    return "24:00";
  }
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function leaveWindowLabel(leave: {
  start_minute?: number | null;
  end_minute?: number | null;
}): string {
  if (leave.start_minute == null || leave.end_minute == null) {
    return "放假";
  }
  return `${formatAvailabilityTime(leave.start_minute)}–${formatAvailabilityTime(leave.end_minute)} Short Break`;
}

export function calendarAssignmentLabel(status: string): string {
  if (status === "assigned") {
    return "已派更，待簽到";
  }
  if (status === "completed") {
    return "已簽到";
  }
  return status;
}

export function calendarSlotLabel(released?: boolean | null): string {
  return released ? "暫無需要" : "待公司派更";
}

export function formatHeadcount(
  actual: number | null | undefined,
  expected: number | null | undefined,
): string | null {
  if (actual == null && expected == null) {
    return null;
  }
  if (expected != null && actual != null) {
    return `${actual} / ${expected}`;
  }
  if (actual != null) {
    return String(actual);
  }
  return `— / ${expected}`;
}

export function lessonStatusLabel(status: LessonStatus): string {
  switch (status) {
    case "open":
      return "開放申請";
    case "assigned":
      return "已派更，待簽到";
    case "completed":
      return "已簽到";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}

export function requestStatusLabel(status: RequestStatus): string {
  switch (status) {
    case "pending":
      return "待審核";
    case "approved":
      return "已核准";
    case "rejected":
      return "已拒絕";
    default:
      return status;
  }
}
