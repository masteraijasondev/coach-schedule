import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { COACH_BACKFILL_DAYS, TIMEZONE } from "@/lib/constants";

export function hongKongToday(): string {
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd");
}

export function parseMonthParam(month?: string): string {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    return month;
  }
  return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM");
}

export function parseDayParam(day: string | undefined, month: string): string {
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day.startsWith(month)) {
    return day;
  }
  const today = hongKongToday();
  return today.startsWith(month) ? today : `${month}-01`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthBoundsIso(month: string): { start: string; end: string } {
  const startLocal = fromZonedTime(`${month}-01T00:00:00`, TIMEZONE);
  const [y, m] = month.split("-").map(Number);
  const next =
    m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const endLocal = fromZonedTime(`${next}-01T00:00:00`, TIMEZONE);
  return { start: startLocal.toISOString(), end: endLocal.toISOString() };
}

export function lessonDayKey(iso: string): string {
  return formatInTimeZone(iso, TIMEZONE, "yyyy-MM-dd");
}

export function getMonthCells(month: string): Date[] {
  const anchor = fromZonedTime(`${month}-01T12:00:00`, TIMEZONE);
  const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end });
}

export function formatCellDay(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, "yyyy-MM-dd");
}

export function assertCoachLessonDate(dateYmd: string): string | null {
  const zonedToday = toZonedTime(new Date(), TIMEZONE);
  const earliest = format(addDays(zonedToday, -COACH_BACKFILL_DAYS), "yyyy-MM-dd");
  if (dateYmd < earliest) {
    return `只能登記近 ${COACH_BACKFILL_DAYS} 天內的課堂（可含未來）`;
  }
  return null;
}
