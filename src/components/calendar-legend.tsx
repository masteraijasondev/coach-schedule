export const CALENDAR_LEGEND = [
  { className: "bg-amber-400", label: "待公司派更" },
  { className: "bg-emerald-400", label: "已派更，待簽到" },
  { className: "bg-sky-500", label: "已簽到" },
  { className: "bg-rose-400", label: "放假或 Short Break" },
];

export const EMPLOYER_CALENDAR_LEGEND = CALENDAR_LEGEND;

export function CalendarLegend({
  items = CALENDAR_LEGEND,
}: {
  items?: { className: string; label: string }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-600">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span
            className={`h-2.5 w-2.5 rounded-full ${item.className}`}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
