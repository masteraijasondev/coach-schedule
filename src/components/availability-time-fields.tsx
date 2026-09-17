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

function TimeSelect({
  label,
  name,
  options,
  current,
  onChange,
}: {
  label: string;
  name: string;
  options: number[];
  current: number;
  onChange?: (minutes: number) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-stone-600">{label}</span>
      {onChange ? (
        <select
          name={name}
          value={current}
          onChange={(event) => onChange(Number(event.target.value))}
          className={selectClass}
          required
        >
          {options.map((minutes) => (
            <option key={minutes} value={minutes}>
              {formatAvailabilityTime(minutes)}
            </option>
          ))}
        </select>
      ) : (
        <select
          name={name}
          defaultValue={current}
          className={selectClass}
          required
        >
          {options.map((minutes) => (
            <option key={minutes} value={minutes}>
              {formatAvailabilityTime(minutes)}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

export function AvailabilityTimeFields({
  defaultStartMinute,
  defaultEndMinute,
  minMinute = 0,
  maxMinute = MINUTES_PER_DAY,
  startName = "start_minute",
  endName = "end_minute",
  startValue,
  endValue,
  onStartChange,
  onEndChange,
}: {
  defaultStartMinute: number;
  defaultEndMinute: number;
  minMinute?: number;
  maxMinute?: number;
  startName?: string;
  endName?: string;
  startValue?: number;
  endValue?: number;
  onStartChange?: (minutes: number) => void;
  onEndChange?: (minutes: number) => void;
}) {
  const starts = startOptions.filter(
    (minutes) =>
      minutes >= minMinute &&
      minutes < maxMinute &&
      (endValue == null || minutes < endValue),
  );
  const ends = endOptions.filter(
    (minutes) =>
      minutes > minMinute &&
      minutes <= maxMinute &&
      (startValue == null || minutes > startValue),
  );

  return (
    <div className="grid min-w-[8.5rem] grid-cols-1 gap-2">
      <TimeSelect
        label="開始"
        name={startName}
        options={starts}
        current={startValue ?? defaultStartMinute}
        onChange={onStartChange}
      />
      <TimeSelect
        label="結束"
        name={endName}
        options={ends}
        current={endValue ?? defaultEndMinute}
        onChange={onEndChange}
      />
    </div>
  );
}
