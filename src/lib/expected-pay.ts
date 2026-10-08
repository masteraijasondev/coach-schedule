import { lessonDayKey, payrollPeriodForDate } from "@/lib/calendar";

export type PayShift = {
  coachId: string;
  startsAt: string;
  endsAt: string;
  status: "assigned" | "completed";
  earnedAmountHkd: number | null;
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

export function periodPayTotals(
  shifts: PayShift[],
  hourlyRate: number | null,
  period: string,
): { confirmed: number; expected: number | null } {
  let confirmed = 0;
  let expected = 0;
  const rate = hourlyRateOrNull(hourlyRate);
  for (const shift of shifts) {
    if (payrollPeriodForDate(lessonDayKey(shift.startsAt)) !== period) {
      continue;
    }
    if (shift.status === "completed") {
      confirmed += Number(shift.earnedAmountHkd ?? 0);
      continue;
    }
    if (shift.status === "assigned" && rate != null) {
      expected += expectedHourlyAmount(
        durationMinutes(shift.startsAt, shift.endsAt),
        rate,
      );
    }
  }
  return {
    confirmed: Math.round(confirmed * 100) / 100,
    expected: rate == null ? null : Math.round(expected * 100) / 100,
  };
}
