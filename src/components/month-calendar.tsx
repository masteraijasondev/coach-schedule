import Link from "next/link";
import {
  formatCellDay,
  getMonthCells,
  hongKongToday,
  shiftMonth,
} from "@/lib/calendar";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const COACH_BADGE_CLASSES = [
  "bg-amber-100 text-amber-900",
  "bg-emerald-100 text-emerald-900",
  "bg-sky-100 text-sky-900",
  "bg-rose-100 text-rose-900",
  "bg-violet-100 text-violet-900",
  "bg-lime-100 text-lime-900",
  "bg-cyan-100 text-cyan-900",
  "bg-orange-100 text-orange-900",
];

const COACH_AVAILABILITY_BADGE_CLASSES = [
  "border border-dashed border-amber-300 bg-amber-50 text-amber-800",
  "border border-dashed border-emerald-300 bg-emerald-50 text-emerald-800",
  "border border-dashed border-sky-300 bg-sky-50 text-sky-800",
  "border border-dashed border-rose-300 bg-rose-50 text-rose-800",
  "border border-dashed border-violet-300 bg-violet-50 text-violet-800",
  "border border-dashed border-lime-300 bg-lime-50 text-lime-800",
  "border border-dashed border-cyan-300 bg-cyan-50 text-cyan-800",
  "border border-dashed border-orange-300 bg-orange-50 text-orange-800",
];

function coachColorIndex(coachName: string): number {
  let hash = 0;
  for (let index = 0; index < coachName.length; index += 1) {
    hash = (hash * 31 + coachName.charCodeAt(index)) >>> 0;
  }
  return hash % COACH_BADGE_CLASSES.length;
}

function getCoachBadgeClass(coachName: string): string {
  return COACH_BADGE_CLASSES[coachColorIndex(coachName)];
}

function getCoachAvailabilityBadgeClass(coachName: string): string {
  return COACH_AVAILABILITY_BADGE_CLASSES[coachColorIndex(coachName)];
}

type CalendarLesson = {
  id: string;
  coachName: string;
};

type CalendarAvailability = {
  id: string;
  label: string;
  coachName: string;
  variant?: "slot" | "leave";
};

type Props = {
  month: string;
  selectedDay: string;
  basePath: string;
  countsByDay: Map<string, number>;
  lessonsByDay: Map<string, CalendarLesson[]>;
  availabilityByDay?: Map<string, CalendarAvailability[]>;
};

export function MonthCalendar({
  month,
  selectedDay,
  basePath,
  countsByDay,
  lessonsByDay,
  availabilityByDay,
}: Props) {
  const cells = getMonthCells(month);
  const today = hongKongToday();
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="space-y-3 ">
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
      <div className="grid grid-cols-7 gap-1 text-center text-sm text-stone-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1 border-2 rounded-2xl">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 items-start gap-1">
        {cells.map((cell) => {
          const day = formatCellDay(cell);
          const inMonth = day.startsWith(month);
          const count = countsByDay.get(day) ?? 0;
          const lessons = lessonsByDay.get(day) ?? [];
          const availabilities = availabilityByDay?.get(day) ?? [];
          const selected = day === selectedDay;
          const isToday = day === today;
          const visibleAvailabilities = selected
            ? availabilities
            : availabilities.slice(0, 2);
          const hiddenAvailabilityCount = selected
            ? 0
            : Math.max(0, availabilities.length - 2);

          return (
            <Link
              key={day}
              href={`${basePath}?month=${month}&day=${day}`}
              className={[
                "flex min-h-14 w-full flex-col rounded-md border p-1 text-left transition",
                inMonth
                  ? "border-stone-200 bg-white"
                  : "border-transparent bg-stone-50 text-stone-400",
                selected ? "ring-2 ring-green-400" : "",
                isToday && !selected ? "border-stone-400" : "",
              ].join(" ")}
            >
              <div className="text-xs font-medium ">{day.slice(8)}</div>
              {count > 0 ? (
                <div className="mt-1 space-y-0.5 font-bold text-sm text-stone-600">
                  <div>{count} 堂</div>
                  {lessons.slice(0, 2).map((lesson) => (
                    <div
                      key={lesson.id}
                      className={`rounded-md px-1 py-0.5 text-center text-[10px] font-semibold ${getCoachBadgeClass(
                        lesson.coachName,
                      )}`}
                    >
                      {lesson.coachName}
                    </div>
                  ))}
                  {lessons.length > 2 ? (
                    <div>+{lessons.length - 2} 位教練</div>
                  ) : null}
                </div>
              ) : null}
              {availabilities.length > 0 ? (
                <div className="mt-1 space-y-0.5">
                  {visibleAvailabilities.map((availability) => (
                    <div
                      key={availability.id}
                      className={`rounded-md px-1 py-0.5 text-center text-[10px] font-medium ${
                        availability.variant === "leave"
                          ? "border border-dashed border-rose-400 bg-rose-50 text-rose-800"
                          : getCoachAvailabilityBadgeClass(
                              availability.coachName,
                            )
                      }`}
                    >
                      {availability.label}
                    </div>
                  ))}
                  {hiddenAvailabilityCount > 0 ? (
                    <div className="text-[10px] font-medium text-stone-600 underline">
                      +{hiddenAvailabilityCount} 時段
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
