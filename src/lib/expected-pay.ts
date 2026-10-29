import { lessonDayKey, payrollPeriodForDate } from "@/lib/calendar";
import type { PayMode } from "@/lib/types";

export type PayShift = {
  coachId: string;
  startsAt: string;
  endsAt: string;
  status: "assigned" | "completed";
  earnedAmountHkd: number | null;
  /** When set, only `per_hour` assigned shifts count toward 時薪估計. */
  payMode?: PayMode | string | null;
  lessonTypeId?: string | null;
};

export function hourlyRateOrNull(
  value: number | string | null | undefined,
): number | null {
  if (value == null || value === "") {
    return null;
  }
  const rate = Number(value);
  return Number.isFinite(rate) ? rate : null;
}

export function durationMinutes(startsAt: string, endsAt: string): number {
  const minutes =
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 0;
  }
  return minutes;
}

/** Same rounding as admin check-in: hourly rate × hours, to the cent. */
export function expectedHourlyAmount(
  minutes: number,
  hourlyRate: number,
): number {
  return Math.round(hourlyRate * (minutes / 60) * 100) / 100;
}

/** True when unregistered pay can be estimated from an hourly rate. */
export function isHourlyPayMode(
  payMode: PayMode | string | null | undefined,
): boolean {
  return payMode === "per_hour";
}

/**
 * Expected pay for one assigned (未簽到) shift.
 * Only `per_hour` uses 時薪；PT／MIIT／小組 return null (簽到後才計).
 */
export function expectedAssignedAmount(
  shift: {
    startsAt: string;
    endsAt: string;
    payMode?: PayMode | string | null;
    lessonTypeId?: string | null;
  },
  hourlyRate: number | null,
  rateByType?: Map<string, number | null> | null,
): number | null {
  if (!isHourlyPayMode(shift.payMode)) {
    return null;
  }
  const typeRate =
    shift.lessonTypeId && rateByType
      ? rateByType.get(shift.lessonTypeId)
      : null;
  const rate =
    typeRate != null && Number.isFinite(typeRate) ? typeRate : hourlyRate;
  if (rate == null) {
    return null;
  }
  return expectedHourlyAmount(
    durationMinutes(shift.startsAt, shift.endsAt),
    rate,
  );
}

export function periodPayTotals(
  shifts: PayShift[],
  hourlyRate: number | null,
  period: string,
  rateByType?: Map<string, number | null> | null,
): { confirmed: number; expected: number | null } {
  let confirmed = 0;
  let expected = 0;
  let hasHourlyEstimate = false;
  const rate = hourlyRateOrNull(hourlyRate);
  for (const shift of shifts) {
    if (payrollPeriodForDate(lessonDayKey(shift.startsAt)) !== period) {
      continue;
    }
    if (shift.status === "completed") {
      confirmed += Number(shift.earnedAmountHkd ?? 0);
      continue;
    }
    if (shift.status !== "assigned") {
      continue;
    }
    const amount = expectedAssignedAmount(shift, rate, rateByType);
    if (amount == null) {
      continue;
    }
    hasHourlyEstimate = true;
    expected += amount;
  }
  return {
    confirmed: Math.round(confirmed * 100) / 100,
    // null when nothing hourly to estimate (avoid showing $0 from PT-only backlog)
    expected: hasHourlyEstimate ? Math.round(expected * 100) / 100 : null,
  };
}
