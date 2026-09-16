export function CalendarLegend() {
  const items = [
    { className: "bg-sky-400", label: "可返工" },
    { className: "bg-amber-400", label: "待公司派更" },
    { className: "bg-emerald-500", label: "上班日期及時間" },
    { className: "bg-rose-400", label: "放假或 Short Break" },
  ];

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
