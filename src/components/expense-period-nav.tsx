import { payrollPeriodLabel, shiftMonth } from "@/lib/calendar";
import Link from "next/link";

export function ExpensePeriodNav({
  basePath,
  period,
}: {
  basePath: string;
  period: string;
}) {
  const prev = shiftMonth(period, -1);
  const next = shiftMonth(period, 1);
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <Link href={`${basePath}?month=${prev}`} className="text-sm text-stone-600 underline">
        上期
      </Link>
      <p className="text-sm font-medium text-stone-800">{payrollPeriodLabel(period)}</p>
      <Link href={`${basePath}?month=${next}`} className="text-sm text-stone-600 underline">
        下期
      </Link>
    </div>
  );
}
