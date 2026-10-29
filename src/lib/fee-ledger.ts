import { coachPayFromFeeRatio } from "@/lib/pt-rate";

/** Hong Kong calendar date YYYY-MM-DD + minutes from midnight. */
export type SlotWindow = {
  date: string;
  startMinute: number;
  endMinute: number;
};

export type FeeLine = {
  studentName: string;
  feeHkd: number;
  provenance: "airtable_appointment" | "coach_rate_fallback";
};

function positiveFee(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return raw;
}

/**
 * One positive fee line per checked-in student.
 * Missing or non-positive appointment prices use headRateFallback.
 */
export function resolveMiitFeeLedger(input: {
  studentNames: string[];
  appointmentFeesByName: ReadonlyMap<string, number>;
  headRateFallback: number;
}): { ok: true; lines: FeeLine[] } | { ok: false; error: string } {
  const names = input.studentNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) {
    return { ok: false, error: "請選擇教了哪位學生" };
  }
  const fallback = positiveFee(input.headRateFallback);
  if (fallback == null) {
    return { ok: false, error: "尚未設定 MIIT 每人薪資" };
  }

  const lines: FeeLine[] = [];
  for (const studentName of names) {
    const appointment = positiveFee(input.appointmentFeesByName.get(studentName));
    if (appointment != null) {
      lines.push({
        studentName,
        feeHkd: appointment,
        provenance: "airtable_appointment",
      });
    } else {
      lines.push({
        studentName,
        feeHkd: fallback,
        provenance: "coach_rate_fallback",
      });
    }
  }
  return { ok: true, lines };
}

/** Sum of line fees × pay ratio (per-line rounding, same as PT). */
export function quoteFeeRatioFromLedger(
  lines: FeeLine[],
  payRatio: number,
): { studentFeeHkd: number; earnedAmountHkd: number } {
  let studentFeeHkd = 0;
  let earnedAmountHkd = 0;
  for (const line of lines) {
    studentFeeHkd += line.feeHkd;
    earnedAmountHkd += coachPayFromFeeRatio(line.feeHkd, payRatio);
  }
  return {
    studentFeeHkd: Math.round(studentFeeHkd * 100) / 100,
    earnedAmountHkd,
  };
}
