import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE, CURRENCY_LABEL } from "@/lib/constants";
import type { LessonStatus, PayMode, RequestStatus } from "@/lib/types";

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
    return "待補";
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
      return "待員工確認";
    case "completed":
      return "已確認";
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
