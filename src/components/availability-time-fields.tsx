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

const SELECT_CHEVRON = {
  default:
    "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 16 16'%3E%3Cpath stroke='%2378716c' stroke-linecap='round' stroke-width='1.5' d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")]",
  leave:
    "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 16 16'%3E%3Cpath stroke='%239f1239' stroke-linecap='round' stroke-width='1.5' d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")]",
} as const;

function selectClass(tone: keyof typeof SELECT_CHEVRON, compact: boolean) {
  return [
    "w-full appearance-none rounded-md border bg-white bg-[length:0.75rem] bg-[right_0.35rem_center] bg-no-repeat outline-none tabular-nums",
    compact ? "min-w-0 py-1 pl-1 pr-5 text-xs" : "min-w-[6.5rem] py-2 pl-2.5 pr-8 text-base",
    tone === "leave"
      ? "border-rose-200 text-rose-950 focus:border-rose-400"
      : "border-stone-300 text-stone-900 focus:border-stone-500",
    SELECT_CHEVRON[tone],
  ].join(" ");
}

function TimeSelect({
  label,
  name,
  options,
  current,
  onChange,
  tone = "default",
  compact = false,
}: {
  label: string;
  name: string;
  options: number[];
  current: number;
  onChange?: (minutes: number) => void;
  tone?: keyof typeof SELECT_CHEVRON;
  compact?: boolean;
}) {
  const fieldClass = selectClass(tone, compact);
  const labelClass = tone === "leave" ? "text-rose-800" : "text-stone-600";

  return (
    <label className={`block min-w-0 space-y-1 ${compact ? "text-xs" : "text-sm"}`}>
      <span className={labelClass}>{label}</span>
      {onChange ? (
        <select
          name={name}
          value={current}
          onChange={(event) => onChange(Number(event.target.value))}
          className={fieldClass}
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
          className={fieldClass}
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
  tone = "default",
  compact = false,
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
  tone?: keyof typeof SELECT_CHEVRON;
  compact?: boolean;
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
    <div className={`grid grid-cols-1 gap-2 ${compact ? "min-w-0" : "min-w-[8.5rem]"}`}>
      <TimeSelect
        label="開始"
        name={startName}
        options={starts}
        current={startValue ?? defaultStartMinute}
        onChange={onStartChange}
        tone={tone}
        compact={compact}
      />
      <TimeSelect
        label="結束"
        name={endName}
        options={ends}
        current={endValue ?? defaultEndMinute}
        onChange={onEndChange}
        tone={tone}
        compact={compact}
      />
    </div>
  );
}
