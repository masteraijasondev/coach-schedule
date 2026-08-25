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

function getCoachBadgeClass(coachName: string): string {
  let hash = 0;
  for (let index = 0; index < coachName.length; index += 1) {
    hash = (hash * 31 + coachName.charCodeAt(index)) >>> 0;
  }
  return COACH_BADGE_CLASSES[hash % COACH_BADGE_CLASSES.length];
}

type CalendarLesson = {
  id: string;
  coachName: string;
};

type Props = {
  month: string;
  selectedDay: string;
  basePath: string;
  countsByDay: Map<string, number>;
  lessonsByDay: Map<string, CalendarLesson[]>;
};

export function MonthCalendar({
  month,
  selectedDay,
  basePath,
  countsByDay,
  lessonsByDay,
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
          const lessons = lessonsByDay.get(day) ?? [];
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
            </Link>
          );
        })}
      </div>
    </div>
  );
}
