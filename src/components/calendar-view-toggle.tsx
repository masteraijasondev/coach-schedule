import type { CalendarView } from "@/lib/calendar";
import Link from "next/link";

export function CalendarViewToggle({
  view,
  monthHref,
  weekHref,
}: {
  view: CalendarView;
  monthHref: string;
  weekHref: string;
}) {
  const itemClass = (active: boolean) =>
    [
      "inline-flex min-h-11 min-w-11 items-center justify-center rounded px-3 text-sm sm:min-h-0 sm:py-1.5",
      active
        ? "bg-stone-900 font-medium text-white"
        : "text-stone-700 hover:bg-stone-100",
    ].join(" ");

  return (
    <div
      className="inline-flex rounded-md border border-stone-300 p-0.5"
      role="tablist"
      aria-label="日曆檢視"
    >
      <Link
        href={monthHref}
        role="tab"
        aria-selected={view === "month"}
        className={itemClass(view === "month")}
      >
        月
      </Link>
      <Link
        href={weekHref}
        role="tab"
        aria-selected={view === "week"}
        className={itemClass(view === "week")}
      >
        週
      </Link>
    </div>
  );
}
