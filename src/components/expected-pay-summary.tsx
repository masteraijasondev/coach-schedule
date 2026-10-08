import { formatMoney } from "@/lib/format";

export function formatExpectedPay(expected: number | null): string {
  return expected == null ? "未設定時薪" : formatMoney(expected);
}

export function ExpectedPaySummary({
  confirmed,
  expected,
  compact = false,
  tour,
}: {
  confirmed: number;
  expected: number | null;
  compact?: boolean;
  tour?: string;
}) {
  const confirmedClass = compact
    ? "text-sm font-medium"
    : "text-lg font-semibold";
  const expectedClass = compact
    ? "text-sm text-stone-600"
    : "text-sm font-medium text-stone-700";

  return (
    <div data-tour={tour} className="text-right">
      <p className={confirmedClass}>已確認薪金：{formatMoney(confirmed)}</p>
      <p className={expectedClass}>
        預期薪金：{formatExpectedPay(expected)}
      </p>
    </div>
  );
}
