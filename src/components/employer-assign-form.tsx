"use client";

import { createLessonAction } from "@/actions/lessons";
import { ActionForm } from "@/components/action-form";
import { LessonRegisterFields } from "@/components/lesson-register-fields";
import { useStudentDirectory } from "@/components/student-directory-provider";
import { Field, SubmitButton } from "@/components/ui";
import { formatAvailabilityTime } from "@/lib/format";
import type { PayMode } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

const DEFAULT_DURATION_MINUTES = 60;
const MAX_END_MINUTE = 23 * 60 + 55;

type LessonTypeOption = {
  id: string;
  name: string;
  pay_mode: PayMode;
  default_duration_minutes: number;
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

export function EmployerAssignForm({
  coachId,
  coachName,
  types,
  date,
  startMinute,
  slotEndMinute,
  clearHref,
}: {
  coachId: string;
  coachName: string;
  types: LessonTypeOption[];
  date: string;
  startMinute: number;
  slotEndMinute: number;
  clearHref: string;
}) {
  const router = useRouter();
  const { directory, ensureStudents } = useStudentDirectory();
  const [typeId, setTypeId] = useState(() => defaultTypeId(types));
  const durationMinutes =
    types.find((t) => t.id === typeId)?.default_duration_minutes ??
    DEFAULT_DURATION_MINUTES;
  const payMode =
    types.find((t) => t.id === typeId)?.pay_mode ?? "per_session";
  const ptBlocked = payMode === "per_student" && directory.status !== "success";
  const startTime = minutesToFormTime(startMinute);
  const endTime = minutesToFormTime(
    resolveEndMinute(startMinute, slotEndMinute, durationMinutes),
  );

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <p className="font-medium">
        派更給 {coachName}
      </p>
      <p className="mt-1 text-sm tabular-nums text-stone-600">
        {date} · {formatAvailabilityTime(startMinute)}–
        {formatAvailabilityTime(
          resolveEndMinute(startMinute, slotEndMinute, durationMinutes),
        )}
      </p>
      <p className="mt-1 text-sm text-stone-500">
        時間已依此時段填入。派更後為待確認，員工確認後才計入薪資。
      </p>
      <ActionForm
        action={createLessonAction}
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSuccess={() => {
          router.replace(clearHref);
        }}
      >
        <input type="hidden" name="coach_id" value={coachId} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="start_time" value={startTime} />
        <input type="hidden" name="end_time" value={endTime} />
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
        <Field label="備註" name="notes" />
        <div className="sm:col-span-2">
          <SubmitButton disabled={ptBlocked}>派更</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
