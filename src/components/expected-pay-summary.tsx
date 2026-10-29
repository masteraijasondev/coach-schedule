import { DataValue } from "@/components/data-value";
import { formatMoney } from "@/lib/format";

export function formatExpectedPay(expected: number | null): string {
  return expected == null ? "—" : formatMoney(expected);
}

export function ExpectedPaySummary({
  confirmed,
  expected,
  compact = false,
  tour,
}: {
  confirmed: number;
  /** Unregistered hourly estimate only; summary shows confirmed + this as 預期合計. */
  expected: number | null;
  compact?: boolean;
  tour?: string;
}) {
  const confirmedClass = compact
    ? "text-base font-bold tabular-nums tracking-tight"
    : "text-2xl font-bold tabular-nums tracking-tight";
  const labelClass = "text-sm text-stone-600";
  const pending =
    expected != null && Number.isFinite(expected) && expected > 0
      ? expected
      : null;
  const projected =
    pending == null
      ? null
      : Math.round((confirmed + pending) * 100) / 100;

  return (
    <div data-tour={tour} className="text-right">
      <p className={labelClass}>已確認薪金</p>
      <p className={confirmedClass}>{formatMoney(confirmed)}</p>
      {projected == null ? null : (
        <p className={labelClass}>
          預期合計（已確認＋未簽到薪金）{" "}
          <DataValue figure>{formatMoney(projected)}</DataValue>
        </p>
      )}
    </div>
  );
}
