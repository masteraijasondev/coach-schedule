"use client";

import { LoadingSpinner } from "@/components/loading-spinner";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function EmployerCoachPicker({
  coaches,
  selectedCoachId,
  week,
}: {
  coaches: { id: string; full_name: string }[];
  selectedCoachId?: string;
  week?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex max-w-sm items-end gap-3">
      <label className="block min-w-0 flex-1 space-y-1 text-sm">
        <span className="text-stone-700">教練</span>
        <select
          value={selectedCoachId ?? ""}
          disabled={pending}
          aria-busy={pending}
          onChange={(event) => {
            const coachId = event.currentTarget.value;
            startTransition(() => {
              if (!coachId) {
                router.push("/employer/lessons");
                return;
              }
              const query = new URLSearchParams({ coach: coachId });
              if (week) {
                query.set("week", week);
              }
              router.push(`/employer/lessons?${query.toString()}`);
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
