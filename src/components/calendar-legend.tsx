export function CalendarLegend() {
  const items = [
    { className: "bg-amber-400", label: "待確認" },
    { className: "bg-emerald-500", label: "已確認" },
    { className: "bg-sky-400", label: "可返工" },
    { className: "bg-rose-400", label: "放假" },
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
