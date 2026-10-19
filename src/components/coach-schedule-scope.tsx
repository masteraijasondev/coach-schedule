"use client";

import type { CoachScheduleScope } from "@/lib/coach-href";

const OPTIONS: { value: CoachScheduleScope; label: string }[] = [
  { value: "self", label: "自己" },
  { value: "all", label: "全體同事" },
];

export function CoachScheduleScopeToggle({
  scope,
  onChange,
}: {
  scope: CoachScheduleScope;
  onChange: (scope: CoachScheduleScope) => void;
}) {
  return (
    <div
      className="inline-flex rounded-md border border-stone-300 p-0.5"
      role="group"
      aria-label="日曆顯示範圍"
    >
      {OPTIONS.map((option) => {
        const active = scope === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={[
              "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]",
              active
                ? "bg-[#2C2C2C] text-white"
                : "text-[#2C2C2C] hover:bg-stone-100",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
