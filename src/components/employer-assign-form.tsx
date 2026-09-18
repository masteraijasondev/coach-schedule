"use client";

import { createLessonAction } from "@/actions/lessons";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { SubmitButton } from "@/components/ui";
import { formatAvailabilityTime } from "@/lib/format";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TIME_STEP_MINUTES = 30;

export function EmployerAssignForm({
  coachId,
  coachName,
  date,
  startMinute,
  slotEndMinute,
  clearHref,
}: {
  coachId: string;
  coachName: string;
  date: string;
  startMinute: number;
  slotEndMinute: number;
  clearHref: string;
}) {
  const router = useRouter();
  const [assignStart, setAssignStart] = useState(startMinute);
  const [assignEnd, setAssignEnd] = useState(slotEndMinute);

  useEffect(() => {
    setAssignStart(startMinute);
    setAssignEnd(slotEndMinute);
  }, [startMinute, slotEndMinute]);

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <p className="font-medium">為 {coachName} 派更</p>
      <p className="mt-1 text-sm tabular-nums text-stone-600">
        {date} · 可返工 {formatAvailabilityTime(startMinute)}–
        {formatAvailabilityTime(slotEndMinute)}
      </p>
      <p className="mt-1 text-sm text-stone-500">
        可僅派其中一段時間。例如可返工為 12:00–20:00，可改為 16:00–20:00。派更後狀態為已派更，待簽到；員工簽到後方計入薪資。
      </p>
      <ActionForm
        action={createLessonAction}
        className="mt-3 grid gap-3"
        onSuccess={() => {
          router.replace(clearHref);
        }}
      >
        <input type="hidden" name="coach_id" value={coachId} />
        <input type="hidden" name="date" value={date} />
        <AvailabilityTimeFields
          defaultStartMinute={startMinute}
          defaultEndMinute={slotEndMinute}
          minMinute={startMinute}
          maxMinute={slotEndMinute}
          startValue={assignStart}
          endValue={assignEnd}
          onStartChange={(next) => {
            setAssignStart(next);
            if (assignEnd <= next) {
              setAssignEnd(Math.min(next + TIME_STEP_MINUTES, slotEndMinute));
            }
          }}
          onEndChange={(next) => {
            setAssignEnd(next);
            if (assignStart >= next) {
              setAssignStart(Math.max(next - TIME_STEP_MINUTES, startMinute));
            }
          }}
        />
        <SubmitButton>派更</SubmitButton>
      </ActionForm>
    </div>
  );
}
