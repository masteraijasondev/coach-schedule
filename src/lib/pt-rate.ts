export function payRatioFromPercent(percent: number): number {
  return Math.round(percent * 100) / 10000;
}

export function formatPayRatioPercent(ratio: number): string {
  const percent = Math.round(ratio * 10000) / 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2);
}

export function coachPayFromFeeRatio(fee: number, ratio: number): number {
  return Math.round(fee * ratio * 100) / 100;
}

export function derivedPayRatio(
  amountHkd: number,
  studentFeeHkd: number | null,
  storedRatio: number | null,
): number | null {
  if (storedRatio != null && Number.isFinite(storedRatio)) {
    return storedRatio;
  }
  if (studentFeeHkd != null && studentFeeHkd > 0) {
    return amountHkd / studentFeeHkd;
  }
  return null;
}
