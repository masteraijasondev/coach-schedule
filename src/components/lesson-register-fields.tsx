"use client";

import { Field, SelectField } from "@/components/ui";
import type { PayMode } from "@/lib/types";
import { useMemo, useState } from "react";
import type { StudentDirectory } from "@/components/student-directory-provider";

type LessonTypeOption = {
  id: string;
  name: string;
  pay_mode: PayMode;
};

type StudentOption = {
  id: string;
  name: string;
};

type Props = {
  types: LessonTypeOption[];
  students: StudentOption[];
  studentDirectory?: StudentDirectory;
  onRetryStudents?: () => void;
  defaultTypeId?: string;
  defaultStudentId?: string;
  defaultHeadcount?: number;
  defaultExpectedHeadcount?: number;
  onTypeChange?: (typeId: string) => void;
};

const PT_RATIO_OPTIONS = [
  { value: "1", label: "1:1" },
  { value: "2", label: "1:2" },
  { value: "3", label: "1:3" },
];

function defaultPtRatio(headcount?: number): string {
  if (headcount === 2 || headcount === 3) {
    return String(headcount);
  }
  return "1";
}

function resolveDefaultTypeId(
  types: LessonTypeOption[],
  defaultTypeId?: string,
): string {
  if (defaultTypeId) {
    return defaultTypeId;
  }
  return types.find((t) => t.name === "PT")?.id ?? types[0]?.id ?? "";
}

export function LessonRegisterFields({
  types,
  students,
  studentDirectory,
  onRetryStudents,
  defaultTypeId,
  defaultStudentId,
  defaultHeadcount,
  defaultExpectedHeadcount,
  onTypeChange,
}: Props) {
  const resolvedDefaultTypeId = resolveDefaultTypeId(types, defaultTypeId);
  const [typeId, setTypeId] = useState(resolvedDefaultTypeId);
  const payMode = useMemo(
    () => types.find((t) => t.id === typeId)?.pay_mode ?? "per_session",
    [types, typeId],
  );
  const studentsReady = studentDirectory
    ? studentDirectory.status === "success"
    : true;
  const studentsLoading = studentDirectory
    ? studentDirectory.status === "loading" ||
      studentDirectory.status === "idle"
    : false;
  const studentsError =
    studentDirectory?.status === "error" ? studentDirectory.error : null;
  const studentEmptyLabel = studentsError
    ? "無法載入學生"
    : studentsLoading
      ? "載入中…"
      : "— 請選擇 —";

  return (
    <>
      <SelectField
        label="課堂類型"
        name="lesson_type_id"
        required
        defaultValue={resolvedDefaultTypeId}
        options={types.map((t) => ({ value: t.id, label: t.name }))}
        onChange={(e) => {
          const next = e.currentTarget.value;
          setTypeId(next);
          onTypeChange?.(next);
        }}
      />
      {payMode === "per_student" ? (
        <>
          <div className="space-y-2">
            <SelectField
              label="學生"
              name="student_id"
              required
              allowEmpty
              disabled={!studentsReady}
              busy={studentsLoading}
              emptyLabel={studentEmptyLabel}
              defaultValue={defaultStudentId}
              options={
                studentsReady
                  ? students.map((s) => ({ value: s.id, label: s.name }))
                  : []
              }
            />
            {studentsError ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-red-700" role="alert">
                  {studentsError}
                </p>
                {onRetryStudents ? (
                  <button
                    type="button"
                    onClick={onRetryStudents}
                    className="text-sm text-stone-600 underline"
                  >
                    重試
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <SelectField
            label="形式"
            name="headcount"
            required
            defaultValue={defaultPtRatio(defaultHeadcount)}
            options={PT_RATIO_OPTIONS}
          />
        </>
      ) : null}
      {payMode === "per_head" ? (
        <>
          <Field
            label="實際人數"
            name="headcount"
            type="number"
            min="1"
            step="1"
            required
            defaultValue={defaultHeadcount?.toString()}
          />
          <Field
            label="應到人數（選填）"
            name="expected_headcount"
            type="number"
            min="1"
            step="1"
            defaultValue={defaultExpectedHeadcount?.toString()}
          />
        </>
      ) : null}
    </>
  );
}
