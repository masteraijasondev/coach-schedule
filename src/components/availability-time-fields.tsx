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
  "w-full rounded-md border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900 outline-none focus:border-stone-500";

export function AvailabilityTimeFields({
  defaultStartMinute,
  defaultEndMinute,
}: {
  defaultStartMinute: number;
  defaultEndMinute: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
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
