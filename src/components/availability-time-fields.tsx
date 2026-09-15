import { formatAvailabilityTime } from "@/lib/format";

const TIME_STEP_MINUTES = 30;
const MINUTES_PER_DAY = 1440;

const startOptions = Array.from(
  { length: MINUTES_PER_DAY / TIME_STEP_MINUTES },
  (_, index) => index * TIME_STEP_MINUTES,
);
const endOptions = Array.from(
  { length: MINUTES_PER_DAY / TIME_STEP_MINUTES },
  (_, index) => (index + 1) * TIME_STEP_MINUTES,
);

const selectClass =
  "w-full min-w-[6.5rem] appearance-none rounded-md border border-stone-300 bg-white bg-[length:0.75rem] bg-[right_0.6rem_center] bg-no-repeat py-2 pl-2.5 pr-8 text-base tabular-nums text-stone-900 outline-none focus:border-stone-500 bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 16 16'%3E%3Cpath stroke='%2378716c' stroke-linecap='round' stroke-width='1.5' d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")]";

export function AvailabilityTimeFields({
  defaultStartMinute,
  defaultEndMinute,
}: {
  defaultStartMinute: number;
  defaultEndMinute: number;
}) {
  return (
    <div className="grid min-w-[8.5rem] grid-cols-1 gap-2">
      <label className="space-y-1 text-sm">
        <span className="text-stone-600">開始</span>
        <select
          name="start_minute"
          defaultValue={defaultStartMinute}
          className={selectClass}
          required
        >
          {startOptions.map((minutes) => (
            <option key={minutes} value={minutes}>
              {formatAvailabilityTime(minutes)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-stone-600">結束</span>
        <select
          name="end_minute"
          defaultValue={defaultEndMinute}
          className={selectClass}
          required
        >
          {endOptions.map((minutes) => (
            <option key={minutes} value={minutes}>
              {formatAvailabilityTime(minutes)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
