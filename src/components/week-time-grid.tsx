import {
  WEEK_HOUR_HEIGHT,
  eventPosition,
  weekHourMarks,
} from "@/lib/week-grid";
import { formatAvailabilityTime } from "@/lib/format";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export function WeekTimeGrid({
  days,
  today,
  selectedDay,
  gridStart,
  gridEnd,
  nowMinute,
  allDay,
  events,
}: {
  days: string[];
  today: string;
  selectedDay?: string;
  gridStart: number;
  gridEnd: number;
  nowMinute: number | null;
  allDay: (date: string) => React.ReactNode;
  events: (date: string) => React.ReactNode;
}) {
  const hours = weekHourMarks(gridStart, gridEnd);
  const bodyHeight = ((gridEnd - gridStart) / 60) * WEEK_HOUR_HEIGHT;
  const showNow =
    nowMinute != null && nowMinute >= gridStart && nowMinute <= gridEnd;
  const nowTop = showNow
    ? eventPosition(nowMinute, nowMinute + 1, gridStart, gridEnd).top
    : 0;

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[52rem]"
        style={{ gridTemplateColumns: "3rem repeat(7, minmax(0, 1fr))" }}
      >
        <div className="border-b border-stone-200" />
        {days.map((date, dayIndex) => {
          const isToday = date === today;
          const selected = date === selectedDay;
          return (
            <div
              key={`head-${date}`}
              className={`border-b border-l border-stone-200 px-1 py-2 text-center ${
                selected ? "bg-stone-100" : "bg-white"
              }`}
            >
              <p className="text-sm font-semibold">{WEEKDAY_LABELS[dayIndex]}</p>
              <p
                className={`mx-auto inline-flex h-6 w-6 items-center justify-center text-sm tabular-nums ${
                  isToday
                    ? "rounded-full bg-stone-900 font-medium text-white"
                    : "text-stone-500"
                }`}
              >
                {Number(date.slice(8))}
              </p>
            </div>
          );
        })}

        <div className="border-b border-stone-200" />
        {days.map((date) => (
          <div
            key={`allday-${date}`}
            className="min-h-10 border-b border-l border-stone-200 p-0.5"
          >
            {allDay(date)}
          </div>
        ))}

        <div className="relative" style={{ height: bodyHeight }}>
          {hours.map((hour) => (
            <div
              key={hour}
              className="absolute right-1 -translate-y-2 text-right text-xs tabular-nums text-stone-400"
              style={{
                top: eventPosition(hour, hour + 60, gridStart, gridEnd).top,
              }}
            >
              {formatAvailabilityTime(hour)}
            </div>
          ))}
          {showNow ? (
            <div
              className="absolute right-0 left-0 z-10 border-t border-rose-500"
              style={{ top: nowTop }}
            />
          ) : null}
        </div>

        {days.map((date) => (
          <div
            key={`body-${date}`}
            className="relative border-l border-stone-200 bg-white"
            style={{ height: bodyHeight }}
          >
            {hours.map((hour) => (
              <div
                key={`${date}-${hour}`}
                className="absolute right-0 left-0 border-t border-stone-100"
                style={{
                  top: eventPosition(hour, hour + 60, gridStart, gridEnd).top,
                }}
              />
            ))}
            {date === today && showNow ? (
              <div
                className="absolute right-0 left-0 z-10 border-t-2 border-rose-500"
                style={{ top: nowTop }}
              />
            ) : null}
            {events(date)}
          </div>
        ))}
      </div>
    </div>
  );
}

export { eventPosition };
