"use client";

import { useRouter } from "next/navigation";

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

  return (
    <label className="block max-w-sm space-y-1 text-sm">
      <span className="text-stone-700">教練</span>
      <select
        value={selectedCoachId ?? ""}
        onChange={(event) => {
          const coachId = event.currentTarget.value;
          if (!coachId) {
            router.push("/employer/lessons");
            return;
          }
          const query = new URLSearchParams({ coach: coachId });
          if (week) {
            query.set("week", week);
          }
          router.push(`/employer/lessons?${query.toString()}`);
        }}
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
      >
        <option value="">— 請選擇教練 —</option>
        {coaches.map((coach) => (
          <option key={coach.id} value={coach.id}>
            {coach.full_name}
          </option>
        ))}
      </select>
    </label>
  );
}
