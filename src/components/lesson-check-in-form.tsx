"use client";

import { confirmLessonPeriodsAction } from "@/actions/lessons";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { SubmitButton } from "@/components/ui";
import { hongKongToday } from "@/lib/calendar";
import {
  pastCheckInEndMinute,
  periodsOverlap,
  type CheckInPeriod,
} from "@/lib/check-in";
import { TIMEZONE } from "@/lib/constants";
import { formatAvailabilityTime } from "@/lib/format";
import { formatInTimeZone } from "date-fns-tz";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const DEFAULT_DURATION_MINUTES = 60;
const TIME_STEP_MINUTES = 30;

function snapStart(windowStart: number, windowEnd: number): number {
  const snapped = Math.ceil(windowStart / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  return snapped < windowEnd ? snapped : windowStart;
}

function defaultEnd(windowStart: number, windowEnd: number): number {
  return Math.min(windowStart + DEFAULT_DURATION_MINUTES, windowEnd);
}

export function LessonCheckInForm({
  lessonId,
  date,
  windowStart,
  windowEnd,
}: {
  lessonId: string;
  date: string;
  windowStart: number;
  windowEnd: number;
}) {
  const router = useRouter();
  const now = new Date();
  const nowMinute =
    Number(formatInTimeZone(now, TIMEZONE, "H")) * 60 +
    Number(formatInTimeZone(now, TIMEZONE, "m"));
  const pastEnd = pastCheckInEndMinute(
    date,
    windowStart,
    windowEnd,
    hongKongToday(),
    nowMinute,
  );
  const initialStart = snapStart(windowStart, pastEnd ?? windowEnd);
  const [draftStart, setDraftStart] = useState(initialStart);
  const [draftEnd, setDraftEnd] = useState(
    defaultEnd(initialStart, pastEnd ?? windowEnd),
  );
  const [periods, setPeriods] = useState<CheckInPeriod[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const payload = useMemo(() => JSON.stringify(periods), [periods]);

  if (pastEnd == null) {
    return (
      <p className="text-sm text-amber-800">只可簽到已經過去的時段</p>
    );
  }
  const latestPastEnd = pastEnd;

  function addPeriod() {
    const next = { startMinute: draftStart, endMinute: draftEnd };
    if (next.endMinute <= next.startMinute) {
      setAddError("結束時間必須晚於開始時間");
      return;
    }
    if (next.startMinute < windowStart || next.endMinute > windowEnd) {
      setAddError("簽到時段必須完全落在派更範圍內");
      return;
    }
    if (next.endMinute > latestPastEnd) {
      setAddError("只可簽到已經過去的時段");
      return;
    }
    if (periods.some((period) => periodsOverlap(period, next))) {
      setAddError("簽到時段不可重疊");
      return;
    }
    setAddError(null);
    setPeriods(
      [...periods, next].sort((a, b) => a.startMinute - b.startMinute),
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] leading-snug text-amber-800">
        只可加入已經過去的時段再確認；未加入同未來的時間不計薪。
      </p>
      <AvailabilityTimeFields
        defaultStartMinute={initialStart}
        defaultEndMinute={defaultEnd(initialStart, pastEnd)}
        minMinute={windowStart}
        maxMinute={pastEnd}
        startName="check_in_start"
        endName="check_in_end"
        startValue={draftStart}
        endValue={draftEnd}
        onStartChange={setDraftStart}
        onEndChange={setDraftEnd}
      />
      <button
        type="button"
        className="w-full min-h-11 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-amber-950"
        onClick={addPeriod}
      >
        加入此時段
      </button>
      {addError ? (
        <p className="text-xs text-red-700" role="alert">
          {addError}
        </p>
      ) : null}
      {periods.length > 0 ? (
        <ul className="space-y-1">
          {periods.map((period) => (
            <li
              key={`${period.startMinute}-${period.endMinute}`}
              className="flex items-center justify-between gap-1 text-xs tabular-nums"
            >
              <span>
                {formatAvailabilityTime(period.startMinute)}–
                {formatAvailabilityTime(period.endMinute)}
              </span>
              <button
                type="button"
                className="min-h-11 rounded-md px-2 text-red-700"
                onClick={() =>
                  setPeriods(
                    periods.filter(
                      (item) =>
                        item.startMinute !== period.startMinute ||
                        item.endMinute !== period.endMinute,
                    ),
                  )
                }
              >
                刪除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[10px] text-stone-500">尚未加入簽到時段</p>
      )}
      <ActionForm
        action={confirmLessonPeriodsAction}
        className="space-y-2"
        onSuccess={() => {
          router.refresh();
        }}
      >
        <input type="hidden" name="lesson_id" value={lessonId} />
        <input type="hidden" name="periods" value={payload} />
        <SubmitButton disabled={periods.length === 0}>確認簽到</SubmitButton>
      </ActionForm>
    </div>
  );
}
