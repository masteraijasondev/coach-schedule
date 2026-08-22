import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE, CURRENCY_LABEL } from "@/lib/constants";
import type { LessonStatus, RequestStatus } from "@/lib/types";

export function formatDateTime(iso: string): string {
  return formatInTimeZone(iso, TIMEZONE, "yyyy-MM-dd HH:mm");
}

export function formatDate(iso: string): string {
  return formatInTimeZone(iso, TIMEZONE, "yyyy-MM-dd");
}

export function formatMoney(amount: number): string {
  return `${CURRENCY_LABEL} $${Number(amount).toFixed(2)}`;
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
      return "已指派";
    case "completed":
      return "已完成";
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
