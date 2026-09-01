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

export function addDaysToYmd(dateYmd: string, days: number): string {
  const [year, month, day] = dateYmd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function availabilityWeekStarts(now = new Date()): string[] {
  const today = formatInTimeZone(now, TIMEZONE, "yyyy-MM-dd");
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const currentMonday = addDaysToYmd(today, -((weekday + 6) % 7));
  return Array.from({ length: 4 }, (_, index) =>
    addDaysToYmd(currentMonday, index * 7),
  );
}

export function parseAvailabilityWeekParam(
  week: string | undefined,
  now = new Date(),
): string {
  const starts = availabilityWeekStarts(now);
  return week && starts.includes(week) ? week : starts[1];
}

export function availabilityWeekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    addDaysToYmd(weekStart, index),
  );
}

/** Floor current HK time to the hour; end is +1 hour (e.g. 09:09 → 09:00–10:00). */
export function defaultLessonTimeSlot(now = new Date()): {
  start: string;
  end: string;
} {
  const hour = Number(formatInTimeZone(now, TIMEZONE, "H"));
  if (hour >= 23) {
    return { start: "23:00", end: "23:55" };
  }
  const start = `${String(hour).padStart(2, "0")}:00`;
  const end = `${String(hour + 1).padStart(2, "0")}:00`;
  return { start, end };
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

export function monthGridDateRange(month: string): {
  start: string;
  end: string;
} {
  const cells = getMonthCells(month);
  return {
    start: formatCellDay(cells[0]),
    end: formatCellDay(cells[cells.length - 1]),
  };
}

/** Payroll period YYYY-MM = 11th of that month through 10th of next month. */
export function payrollPeriodForDate(dateYmd: string): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  if (d >= 11) {
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  const date = new Date(Date.UTC(y, m - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentPayrollPeriod(): string {
  return payrollPeriodForDate(hongKongToday());
}

export function parsePayrollPeriodParam(period?: string): string {
  if (period && /^\d{4}-\d{2}$/.test(period)) {
    return period;
  }
  return currentPayrollPeriod();
}

export function payrollPeriodBoundsIso(period: string): {
  start: string;
  end: string;
} {
  const [y, m] = period.split("-").map(Number);
  const startLocal = fromZonedTime(
    `${y}-${String(m).padStart(2, "0")}-11T00:00:00`,
    TIMEZONE,
  );
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const endLocal = fromZonedTime(
    `${nextY}-${String(nextM).padStart(2, "0")}-11T00:00:00`,
    TIMEZONE,
  );
  return { start: startLocal.toISOString(), end: endLocal.toISOString() };
}

export function payrollPeriodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return `${m}月11日 – ${nextM}月10日`;
}

export function assertCoachLessonDate(dateYmd: string): string | null {
  const zonedToday = toZonedTime(new Date(), TIMEZONE);
  const earliest = format(addDays(zonedToday, -COACH_BACKFILL_DAYS), "yyyy-MM-dd");
  if (dateYmd < earliest) {
    return `只能登記近 ${COACH_BACKFILL_DAYS} 天內的課堂（可含未來）`;
  }
  return null;
}

