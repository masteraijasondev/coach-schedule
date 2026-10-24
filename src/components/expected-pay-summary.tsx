import { DataValue } from "@/components/data-value";
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
    ? "text-base font-bold tabular-nums tracking-tight"
    : "text-2xl font-bold tabular-nums tracking-tight";
  const labelClass = "text-sm text-stone-600";

  return (
    <div data-tour={tour} className="text-right">
      <p className={labelClass}>已確認薪金</p>
      <p className={confirmedClass}>{formatMoney(confirmed)}</p>
      {expected === 0 ? null : (
        <p className={labelClass}>
          預期薪金{" "}
          <DataValue figure>{formatExpectedPay(expected)}</DataValue>
        </p>
      )}
    </div>
  );
}
