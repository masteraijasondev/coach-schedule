const TIME_STEP_MINUTES = 30;

export type CheckInPeriod = {
  startMinute: number;
  endMinute: number;
};

export function parseCheckInPeriods(
  raw: string,
): { ok: true; periods: CheckInPeriod[] } | { ok: false; error: string } {
  if (raw.trim() === "") {
    return { ok: false, error: "請加入至少一個簽到時段" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "簽到時段格式無效" };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { ok: false, error: "請加入至少一個簽到時段" };
  }
  const periods: CheckInPeriod[] = [];
  for (const item of parsed) {
    if (
      typeof item !== "object" ||
      item == null ||
      !("startMinute" in item) ||
      !("endMinute" in item)
    ) {
      return { ok: false, error: "簽到時段格式無效" };
    }
    const startMinute = Number(
      (item as { startMinute: unknown }).startMinute,
    );
    const endMinute = Number((item as { endMinute: unknown }).endMinute);
    if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) {
      return { ok: false, error: "簽到時段格式無效" };
    }
    periods.push({ startMinute, endMinute });
  }
  return { ok: true, periods };
}

export function pastCheckInEndMinute(
  date: string,
  windowStart: number,
  windowEnd: number,
  today: string,
  nowMinute: number,
): number | null {
  let maxEnd = windowEnd;
  if (date > today) {
    return null;
  }
  if (date === today) {
    maxEnd = Math.min(
      windowEnd,
      Math.floor(nowMinute / TIME_STEP_MINUTES) * TIME_STEP_MINUTES,
    );
  }
  if (maxEnd <= windowStart) {
    return null;
  }
  return maxEnd;
}

export function assertCheckInPeriods(
  periods: CheckInPeriod[],
  windowStart: number,
  windowEnd: number,
  pastEndMinute: number | null,
): string | null {
  if (periods.length === 0) {
    return "請加入至少一個簽到時段";
  }
  if (pastEndMinute == null) {
    return "只可簽到已經過去的時段";
  }
  const sorted = [...periods].sort(
    (a, b) => a.startMinute - b.startMinute,
  );
  let previousEnd = windowStart;
  for (const period of sorted) {
    if (
      period.startMinute < windowStart ||
      period.endMinute > windowEnd ||
      period.endMinute <= period.startMinute
    ) {
      return "簽到時段必須完全落在派更範圍內";
    }
    if (period.endMinute > pastEndMinute) {
      return "只可簽到已經過去的時段";
    }
    if (
      period.startMinute % TIME_STEP_MINUTES !== 0 ||
      period.endMinute % TIME_STEP_MINUTES !== 0
    ) {
      return "時間請以 30 分鐘為單位";
    }
    if (period.startMinute < previousEnd) {
      return "簽到時段不可重疊";
    }
    previousEnd = period.endMinute;
  }
  return null;
}

export function checkInDurationMinutes(periods: CheckInPeriod[]): number {
  return periods.reduce(
    (sum, period) => sum + (period.endMinute - period.startMinute),
    0,
  );
}

export function periodsOverlap(
  left: CheckInPeriod,
  right: CheckInPeriod,
): boolean {
  return left.startMinute < right.endMinute && left.endMinute > right.startMinute;
}
