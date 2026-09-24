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
  initialPeriods = [],
  submitLabel = "確認簽到",
  workTypes,
  initialLessonTypeId,
  staffKind = "coach",
  students = [],
  initialStudentId,
}: {
  lessonId: string;
  date: string;
  windowStart: number;
  windowEnd: number;
  initialPeriods?: CheckInPeriod[];
  submitLabel?: string;
  workTypes: { id: string; name: string }[];
  initialLessonTypeId?: string;
  staffKind?: "coach" | "operations";
  students?: { id: string; name: string }[];
  initialStudentId?: string;
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
  const [periods, setPeriods] = useState<CheckInPeriod[]>(initialPeriods);
  const [lessonTypeId, setLessonTypeId] = useState(
    workTypes.some((type) => type.id === initialLessonTypeId)
      ? initialLessonTypeId ?? ""
      : workTypes[0]?.id ?? "",
  );
  const [studentId, setStudentId] = useState(initialStudentId ?? "");
  const [addError, setAddError] = useState<string | null>(null);
  const payload = useMemo(() => JSON.stringify(periods), [periods]);

  if (pastEnd == null) {
    return (
      <p className="text-sm text-amber-800">只可簽到已經結束的時段</p>
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
      setAddError("只可簽到已經結束的時段");
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
        只可加入已經結束的時段再確認；未加入及尚未結束的時段不計入薪資。
      </p>
      {workTypes.length === 0 ? (
        <p className="text-sm text-amber-800">尚未獲分配工作類型，請聯絡公司。</p>
      ) : (
        <label className="block space-y-1 text-sm">
          <span className="text-stone-700">實際工作</span>
          <select
            required
            value={lessonTypeId}
            onChange={(event) => setLessonTypeId(event.target.value)}
            className="w-full rounded-md border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900"
          >
            {workTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {staffKind === "coach" ? (
        <label className="block space-y-1 text-sm">
          <span className="text-stone-700">教了哪位學生</span>
          <select
            required
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            className="w-full rounded-md border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900"
          >
            <option value="">請選擇</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
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
        className="min-h-11 w-full cursor-pointer rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-amber-950"
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
                className="min-h-11 cursor-pointer rounded-md px-2 text-red-700"
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
        <input type="hidden" name="lesson_type_id" value={lessonTypeId} />
        <input type="hidden" name="student_id" value={studentId} />
        <SubmitButton
          disabled={
            periods.length === 0 ||
            workTypes.length === 0 ||
            (staffKind === "coach" && studentId === "")
          }
        >
          {submitLabel}
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
