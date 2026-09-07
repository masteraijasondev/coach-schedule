"use client";

import { useMemo, useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);
const MINUTES = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0"),
);

function snapMinute(minute: number): string {
  const snapped = Math.round(minute / 5) * 5;
  const normalized = snapped === 60 ? 55 : snapped;
  return String(normalized).padStart(2, "0");
}

function parseDefault(value?: string): { hour: string; minute: string } {
  if (value && /^\d{2}:\d{2}/.test(value)) {
    const [h, m] = value.split(":");
    return { hour: h, minute: snapMinute(Number(m)) };
  }
  return { hour: "09", minute: "00" };
}

const selectClass =
  "min-w-0 flex-1 appearance-none rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-center text-base font-medium tabular-nums text-stone-900 outline-none transition hover:border-stone-300 focus:border-stone-500 focus:bg-white focus:ring-2 focus:ring-stone-200";

type Props = {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
};

export function TimeSelect({ label, name, required, defaultValue }: Props) {
  const initial = useMemo(() => parseDefault(defaultValue), [defaultValue]);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const value = `${hour}:${minute}`;

  return (
    <div className="block space-y-1.5 text-sm">
      <span className="text-stone-700">{label}</span>
      <input type="hidden" name={name} value={value} required={required} />
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`${name}-hour`}>
          {label}（時）
        </label>
        <select
          id={`${name}-hour`}
          value={hour}
          onChange={(e) => setHour(e.target.value)}
          className={selectClass}
          aria-label={`${label} 小時`}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="text-lg font-semibold text-stone-400" aria-hidden>
          :
        </span>
        <label className="sr-only" htmlFor={`${name}-minute`}>
          {label}（分）
        </label>
        <select
          id={`${name}-minute`}
          value={minute}
          onChange={(e) => setMinute(e.target.value)}
          className={selectClass}
          aria-label={`${label} 分鐘`}
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-stone-400">以 5 分鐘為單位</p>
    </div>
  );
}
