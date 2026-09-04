"use client";

import { createLessonAction } from "@/actions/lessons";
import { ActionForm } from "@/components/action-form";
import { LessonRegisterFields } from "@/components/lesson-register-fields";
import { useStudentDirectory } from "@/components/student-directory-provider";
import { TimeSelect } from "@/components/time-select";
import { Field, SubmitButton } from "@/components/ui";
import { formatAvailabilityTime } from "@/lib/format";
import type { PayMode } from "@/lib/types";
import Link from "next/link";
import { useMemo, useState } from "react";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const DEFAULT_DURATION_MINUTES = 60;
const MAX_END_MINUTE = 23 * 60 + 55;

type LessonTypeOption = {
  id: string;
  name: string;
  pay_mode: PayMode;
  default_duration_minutes: number;
};

type AvailabilitySlot = {
  id: string;
  available_date: string;
  start_minute: number;
  end_minute: number;
};

type SlotSelection = {
  date: string;
  startMinute: number;
  slotEndMinute: number;
};

function minutesToFormTime(minutes: number): string {
  const capped = Math.min(Math.max(minutes, 0), MAX_END_MINUTE);
  const snapped = Math.round(capped / 5) * 5;
  const normalized = Math.min(snapped, MAX_END_MINUTE);
  const hour = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minute = String(normalized % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function resolveEndMinute(
  startMinute: number,
  slotEndMinute: number,
  durationMinutes: number,
): number {
  return Math.min(startMinute + durationMinutes, slotEndMinute, MAX_END_MINUTE);
}

function defaultTypeId(types: LessonTypeOption[]): string {
  return types.find((t) => t.name === "PT")?.id ?? types[0]?.id ?? "";
}

export function EmployerAssignWorkspace({
  coachId,
  coachName,
  week,
  weekEnd,
  days,
  today,
  prevWeekHref,
  nextWeekHref,
  currentWeekHref,
  isCurrentWeek,
  slots,
  leaveDates,
  types,
}: {
  coachId: string;
  coachName: string;
  week: string;
  weekEnd: string;
  days: string[];
  today: string;
  prevWeekHref: string;
  nextWeekHref: string;
  currentWeekHref: string;
  isCurrentWeek: boolean;
  slots: AvailabilitySlot[];
  leaveDates: string[];
  types: LessonTypeOption[];
}) {
  const { directory, ensureStudents } = useStudentDirectory();
  const leaveSet = useMemo(() => new Set(leaveDates), [leaveDates]);
  const byDate = useMemo(() => {
    const map = new Map<string, AvailabilitySlot[]>();
    for (const slot of slots) {
      const list = map.get(slot.available_date) ?? [];
      list.push(slot);
      map.set(slot.available_date, list);
    }
    return map;
  }, [slots]);

  const [typeId, setTypeId] = useState(() => defaultTypeId(types));
  const [selection, setSelection] = useState<SlotSelection | null>(null);

  const durationMinutes =
    types.find((t) => t.id === typeId)?.default_duration_minutes ??
    DEFAULT_DURATION_MINUTES;
  const payMode =
    types.find((t) => t.id === typeId)?.pay_mode ?? "per_session";
  const ptBlocked = payMode === "per_student" && directory.status !== "success";

  const formDate = selection?.date ?? today;
  const formStart = selection
    ? minutesToFormTime(selection.startMinute)
    : "09:00";
  const formEnd = selection
    ? minutesToFormTime(
        resolveEndMinute(
          selection.startMinute,
          selection.slotEndMinute,
          durationMinutes,
        ),
      )
    : "10:00";
  const timeKey = `${formDate}-${formStart}-${formEnd}-${typeId}`;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Link href={prevWeekHref} className="text-sm text-stone-600 underline">
            上週
          </Link>
          <p className="text-sm font-medium">
            {coachName} · {week} – {weekEnd}
          </p>
          <Link href={nextWeekHref} className="text-sm text-stone-600 underline">
            下週
          </Link>
        </div>
        {!isCurrentWeek ? (
          <Link
            href={currentWeekHref}
            className="text-sm text-stone-600 underline"
          >
            返回本週
          </Link>
        ) : null}
        <p className="text-sm text-stone-500">
          點選可返工時段以填入派更時間（結束時間為類型預設時長，不會超出該時段）。此週曆只讀。
        </p>
        <div className="overflow-x-auto">
          <div className="grid min-w-[1260px] grid-cols-7 overflow-hidden rounded-lg border border-stone-200">
            {days.map((date, dayIndex) => {
              const onLeave = leaveSet.has(date);
              const daySlots = onLeave ? [] : (byDate.get(date) ?? []);
              const columnFilled = onLeave || daySlots.length > 0;
              return (
                <section
                  key={date}
                  className={`min-h-64 border-l border-stone-200 first:border-l-0 ${
                    onLeave
                      ? "bg-rose-50"
                      : columnFilled
                        ? "bg-white"
                        : "bg-stone-100"
                  }`}
                >
                  <div
                    className={`border-b border-stone-200 px-3 py-3 text-center ${
                      onLeave
                        ? "bg-rose-100"
                        : columnFilled
                          ? "bg-white"
                          : "bg-stone-200"
                    } ${date === today ? "ring-2 ring-inset ring-sky-400" : ""}`}
                  >
                    <p className="font-semibold">
                      星期{WEEKDAY_LABELS[dayIndex]}
                    </p>
                    <p className="text-sm text-stone-500">{date.slice(5)}</p>
                  </div>
                  <div className="space-y-2 p-2">
                    {onLeave ? (
                      <p className="rounded-md bg-rose-100 px-2 py-2 text-center text-sm font-medium text-rose-900">
                        放假
                      </p>
                    ) : daySlots.length === 0 ? (
                      <p className="py-4 text-center text-sm font-medium text-stone-500">
                        未報
                      </p>
                    ) : (
                      daySlots.map((slot) => {
                        const selected =
                          selection?.date === date &&
                          selection.startMinute === slot.start_minute &&
                          selection.slotEndMinute === slot.end_minute;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() =>
                              setSelection({
                                date,
                                startMinute: slot.start_minute,
                                slotEndMinute: slot.end_minute,
                              })
                            }
                            className={`w-full rounded-md px-2 py-2 text-left text-sm ${
                              selected
                                ? "bg-stone-900 text-white"
                                : "bg-sky-100 text-sky-950 hover:bg-sky-200"
                            }`}
                          >
                            {formatAvailabilityTime(slot.start_minute)} –{" "}
                            {formatAvailabilityTime(slot.end_minute)}
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>

      <ActionForm
        action={createLessonAction}
        className="grid gap-3 sm:grid-cols-2"
        onSuccess={() => setSelection(null)}
      >
        <input type="hidden" name="coach_id" value={coachId} />
        <LessonRegisterFields
          types={types}
          students={directory.students}
          studentDirectory={directory}
          onRetryStudents={() => {
            void ensureStudents();
          }}
          defaultTypeId={typeId}
          onTypeChange={setTypeId}
        />
        <Field
          key={`date-${formDate}`}
          label="日期"
          name="date"
          type="date"
          required
          defaultValue={formDate}
        />
        <div className="grid grid-cols-2 gap-3">
          <TimeSelect
            key={`start-${timeKey}`}
            label="開始"
            name="start_time"
            required
            defaultValue={formStart}
          />
          <TimeSelect
            key={`end-${timeKey}`}
            label="結束"
            name="end_time"
            required
            defaultValue={formEnd}
          />
        </div>
        <Field label="備註" name="notes" />
        <div className="sm:col-span-2">
          <SubmitButton disabled={ptBlocked}>派更</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
