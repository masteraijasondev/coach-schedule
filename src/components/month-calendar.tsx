import Link from "next/link";
import {
  formatCellDay,
  getMonthCells,
  hongKongToday,
  shiftMonth,
} from "@/lib/calendar";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

type Props = {
  month: string;
  selectedDay: string;
  basePath: string;
  countsByDay: Map<string, number>;
};

export function MonthCalendar({
  month,
  selectedDay,
  basePath,
  countsByDay,
}: Props) {
  const cells = getMonthCells(month);
  const today = hongKongToday();
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Link
          href={`${basePath}?month=${prev}`}
          className="text-sm text-stone-600 underline"
        >
          上月
        </Link>
        <p className="font-semibold">{month}</p>
        <Link
          href={`${basePath}?month=${next}`}
          className="text-sm text-stone-600 underline"
        >
          下月
        </Link>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-stone-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const day = formatCellDay(cell);
          const inMonth = day.startsWith(month);
          const count = countsByDay.get(day) ?? 0;
          const selected = day === selectedDay;
          const isToday = day === today;

          return (
            <Link
              key={day}
              href={`${basePath}?month=${month}&day=${day}`}
              className={[
                "min-h-14 rounded-md border p-1 text-left transition",
                inMonth
                  ? "border-stone-200 bg-white"
                  : "border-transparent bg-stone-50 text-stone-400",
                selected ? "ring-2 ring-stone-900" : "",
                isToday && !selected ? "border-stone-400" : "",
              ].join(" ")}
            >
              <div className="text-xs font-medium">{day.slice(8)}</div>
              {count > 0 ? (
                <div className="mt-1 text-[10px] text-stone-600">{count} 堂</div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
