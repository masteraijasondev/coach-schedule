"use client";

import { LoadingSpinner } from "@/components/loading-spinner";
import {
  calendarHrefFromLocation,
  pushCalendarHref,
} from "@/lib/calendar-history";
import { employerCalendarHref } from "@/lib/employer-href";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function EmployerCoachPicker({
  coaches,
  selectedCoachId,
  month,
  day,
  week,
  view,
  onCoachChange,
}: {
  coaches: { id: string; full_name: string }[];
  selectedCoachId?: string;
  month?: string;
  day?: string;
  week?: string;
  view?: "month" | "week";
  onCoachChange?: (coachId: string | undefined) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex max-w-sm items-end gap-3">
      <label className="block min-w-0 flex-1 space-y-1 text-sm">
        <span className="text-stone-700">員工</span>
        <select
          value={selectedCoachId ?? ""}
          disabled={pending}
          aria-busy={pending}
          onChange={(event) => {
            const coachId = event.currentTarget.value || undefined;
            if (onCoachChange) {
              pushCalendarHref(
                calendarHrefFromLocation({
                  coach: coachId,
                  week: coachId ? week : undefined,
                  view: view === "week" ? "week" : undefined,
                }),
              );
              onCoachChange(coachId);
              return;
            }
            startTransition(() => {
              router.push(
                employerCalendarHref({
                  month,
                  day,
                  coach: coachId,
                  week: coachId ? week : undefined,
                  view,
                }),
              );
            });
          }}
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <option value="">— 請選擇教練 —</option>
          {coaches.map((coach) => (
            <option key={coach.id} value={coach.id}>
              {coach.full_name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center">
        {pending ? <LoadingSpinner size="sm" label="載入教練資料…" /> : null}
      </div>
    </div>
  );
}
