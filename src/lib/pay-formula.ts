import { formatMoney } from "@/lib/format";
import type { PayMode } from "@/lib/types";

export function payRatioPercentLabel(ratio: number | null | undefined): string | null {
  if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) {
    return null;
  }
  const percent = Math.round(ratio * 10000) / 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(2)}%`;
}

export function hoursFromMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 0;
  }
  return Math.round((minutes / 60) * 100) / 100;
}

/** One-line pay formula for check-in preview and salary rows. */
export function describePayFormula(input: {
  payMode: PayMode | string | null | undefined;
  studentCount?: number;
  unitRate?: number | null;
  payRatio?: number | null;
  minutes?: number;
}): { line: string; amount: number | null; blocked: string | null } {
  const mode = input.payMode ?? null;
  const ratioLabel = payRatioPercentLabel(input.payRatio);
  const rate = input.unitRate;
  const count = input.studentCount ?? 0;
  const minutes = input.minutes ?? 0;

  if (mode === "per_head") {
    if (rate == null || !Number.isFinite(rate) || rate < 0) {
      return {
        line: "MIIT：人數 × 每人價 × 分成",
        amount: null,
        blocked: "尚未設定 MIIT 每人薪資",
      };
    }
    if (input.payRatio == null || !Number.isFinite(input.payRatio) || input.payRatio <= 0) {
      return {
        line: `MIIT：人數 × ${formatMoney(rate)} × 分成`,
        amount: null,
        blocked: "尚未設定 Coach 分成比例",
      };
    }
    if (count <= 0) {
      return {
        line: `人數 × ${formatMoney(rate)} × ${ratioLabel}`,
        amount: null,
        blocked: null,
      };
    }
    const fee = Math.round(rate * count * 100) / 100;
    const amount = Math.round(fee * Number(input.payRatio) * 100) / 100;
    return {
      line: `${count} × ${formatMoney(rate)} × ${ratioLabel} = ${formatMoney(amount)}`,
      amount,
      blocked: null,
    };
  }

  if (mode === "per_student") {
    if (!ratioLabel) {
      return {
        line: "學生學費 × 分成",
        amount: null,
        blocked: "尚未設定 Coach 分成比例",
      };
    }
    if (count <= 0) {
      return {
        line: `學生學費 × ${ratioLabel}（按每位學生 Airtable 學費）`,
        amount: null,
        blocked: null,
      };
    }
    return {
      line: `${count} 位學生：學費合計 × ${ratioLabel}（簽到後按 Airtable 計算）`,
      amount: null,
      blocked: null,
    };
  }

  if (mode === "per_hour") {
    if (rate == null || !Number.isFinite(rate) || rate < 0) {
      return {
        line: "時薪 × 小時",
        amount: null,
        blocked: "尚未設定此工作類型時薪",
      };
    }
    const hours = hoursFromMinutes(minutes);
    if (hours <= 0) {
      return {
        line: `${formatMoney(rate)}／小時 × 時數`,
        amount: null,
        blocked: null,
      };
    }
    const amount = Math.round(rate * hours * 100) / 100;
    return {
      line: `${formatMoney(rate)} × ${hours} 小時 = ${formatMoney(amount)}`,
      amount,
      blocked: null,
    };
  }

  if (mode === "per_session") {
    if (rate == null || !Number.isFinite(rate) || rate < 0) {
      return {
        line: "按堂固定金額",
        amount: null,
        blocked: "尚未設定此工作類型金額",
      };
    }
    return {
      line: `按堂 ${formatMoney(rate)}`,
      amount: rate,
      blocked: null,
    };
  }

  return {
    line: "選擇工作類型後顯示計算方式",
    amount: null,
    blocked: null,
  };
}

export function expectedPayMethodLabel(): string {
  return "預期薪金只估計按時薪計的未簽到派更；PT／MIIT 要簽到後才計入已確認薪金。";
}
