import { formatAvailabilityTime } from "@/lib/format";

const MINUTES_PER_DAY = 1440;

function minuteOptions(stepMinutes: number, kind: "start" | "end"): number[] {
  const count = MINUTES_PER_DAY / stepMinutes;
  return Array.from({ length: count }, (_, index) =>
    kind === "start" ? index * stepMinutes : (index + 1) * stepMinutes,
  );
}

function withCurrent(options: number[], current: number): number[] {
  if (options.includes(current)) {
    return options;
  }
  return [...options, current].sort((left, right) => left - right);
}

const SELECT_CHEVRON = {
  default:
    "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 16 16'%3E%3Cpath stroke='%2378716c' stroke-linecap='round' stroke-width='1.5' d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")]",
  leave:
    "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 16 16'%3E%3Cpath stroke='%2344403c' stroke-linecap='round' stroke-width='1.5' d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")]",
  sick:
    "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 16 16'%3E%3Cpath stroke='%23991b1b' stroke-linecap='round' stroke-width='1.5' d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")]",
} as const;

const FIELD_CLASS = {
  default: "border-stone-300 text-stone-900 focus:border-stone-500",
  leave: "border-stone-300 text-stone-900 focus:border-stone-500",
  sick: "border-red-200 text-red-950 focus:border-red-400",
} as const;

const LABEL_CLASS = {
  default: "text-stone-600",
  leave: "text-stone-700",
  sick: "text-red-800",
} as const;

function selectClass(tone: keyof typeof SELECT_CHEVRON, compact: boolean) {
  return [
    "w-full appearance-none rounded-md border bg-white bg-[length:0.75rem] bg-[right_0.35rem_center] bg-no-repeat outline-none tabular-nums",
    compact ? "min-w-0 py-1 pl-1 pr-5 text-xs" : "min-w-[6.5rem] py-2 pl-2.5 pr-8 text-base",
    FIELD_CLASS[tone],
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
  const labelClass = LABEL_CLASS[tone];

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
  stepMinutes = 30,
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
  stepMinutes?: number;
}) {
  const selectedStart = startValue ?? defaultStartMinute;
  const selectedEnd = endValue ?? defaultEndMinute;
  const starts = withCurrent(
    minuteOptions(stepMinutes, "start").filter((minutes) => {
      if (minutes < minMinute || minutes >= maxMinute) {
        return false;
      }
      // A controlled end must not hide later starts. The one-hour default
      // otherwise leaves only 00:00 and 00:30 on a shift that begins at midnight.
      if (onStartChange) {
        return true;
      }
      return endValue == null || minutes < endValue;
    }),
    selectedStart,
  );
  const ends = withCurrent(
    minuteOptions(stepMinutes, "end").filter(
      (minutes) =>
        minutes > minMinute &&
        minutes <= maxMinute &&
        (startValue == null || minutes > startValue),
    ),
    selectedEnd,
  );

  function changeStart(minutes: number) {
    onStartChange?.(minutes);
    if (!onEndChange || minutes < selectedEnd) {
      return;
    }
    const nextEnd = Math.min(minutes + stepMinutes, maxMinute);
    if (nextEnd > minutes) {
      onEndChange(nextEnd);
    }
  }

  return (
    <div className={`grid grid-cols-1 gap-2 ${compact ? "min-w-0" : "min-w-[8.5rem]"}`}>
      <TimeSelect
        label="開始"
        name={startName}
        options={starts}
        current={selectedStart}
        onChange={onStartChange ? changeStart : undefined}
        tone={tone}
        compact={compact}
      />
      <TimeSelect
        label="結束"
        name={endName}
        options={ends}
        current={selectedEnd}
        onChange={onEndChange}
        tone={tone}
        compact={compact}
      />
    </div>
  );
}
