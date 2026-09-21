"use client";

import { releaseAvailabilityAction } from "@/actions/availability";
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
  const [releaseRemainder, setReleaseRemainder] = useState(true);

  useEffect(() => {
    setAssignStart(startMinute);
    setAssignEnd(slotEndMinute);
    setReleaseRemainder(true);
  }, [startMinute, slotEndMinute]);

  const hasRemainder =
    assignStart > startMinute || assignEnd < slotEndMinute;

  function goClear() {
    router.replace(clearHref);
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <p className="font-medium">為 {coachName} 派更</p>
      <p className="mt-1 text-sm tabular-nums text-stone-600">
        {date} · 可返工 {formatAvailabilityTime(startMinute)}–
        {formatAvailabilityTime(slotEndMinute)}
      </p>
      <p className="mt-1 text-sm text-stone-500">
        可僅派其中一段時間。例如可返工為 12:00–18:00，可改為 12:30–16:30。其餘時間可標為暫無需要，員工日曆會以灰色顯示，表示公司暫不需要該時段。
      </p>
      <div className="mt-3 grid gap-3">
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
        {hasRemainder ? (
          <label className="flex items-start gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={releaseRemainder}
              onChange={(event) => setReleaseRemainder(event.target.checked)}
              className="mt-0.5 size-4 rounded border-stone-300"
            />
            <span>
              將其餘可返工時間標為暫無需要（
              {assignStart > startMinute
                ? `${formatAvailabilityTime(startMinute)}–${formatAvailabilityTime(assignStart)}`
                : null}
              {assignStart > startMinute && assignEnd < slotEndMinute
                ? "、"
                : null}
              {assignEnd < slotEndMinute
                ? `${formatAvailabilityTime(assignEnd)}–${formatAvailabilityTime(slotEndMinute)}`
                : null}
              ）
            </span>
          </label>
        ) : null}
        <ActionForm
          action={createLessonAction}
          className="grid gap-3"
          onSuccess={goClear}
        >
          <input type="hidden" name="coach_id" value={coachId} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="start_minute" value={assignStart} />
          <input type="hidden" name="end_minute" value={assignEnd} />
          <input type="hidden" name="slot_start_minute" value={startMinute} />
          <input type="hidden" name="slot_end_minute" value={slotEndMinute} />
          {hasRemainder && releaseRemainder ? (
            <input type="hidden" name="release_remainder" value="1" />
          ) : null}
          <SubmitButton>派更</SubmitButton>
        </ActionForm>
        <ActionForm
          action={releaseAvailabilityAction}
          className="grid gap-3"
          onSuccess={goClear}
        >
          <input type="hidden" name="coach_id" value={coachId} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="start_minute" value={assignStart} />
          <input type="hidden" name="end_minute" value={assignEnd} />
          <SubmitButton
            variant="secondary"
            className="w-full min-w-0 border border-stone-400 bg-stone-200 text-stone-800 hover:bg-stone-300"
          >
            {`暫無需要（${formatAvailabilityTime(assignStart)}–${formatAvailabilityTime(assignEnd)}）`}
          </SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
