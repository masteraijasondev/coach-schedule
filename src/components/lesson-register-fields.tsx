"use client";

import { Field, SelectField } from "@/components/ui";
import type { PayMode } from "@/lib/types";
import { useMemo, useState } from "react";

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
  defaultTypeId?: string;
  defaultStudentId?: string;
  defaultHeadcount?: number;
  defaultExpectedHeadcount?: number;
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
  defaultTypeId,
  defaultStudentId,
  defaultHeadcount,
  defaultExpectedHeadcount,
}: Props) {
  const resolvedDefaultTypeId = resolveDefaultTypeId(types, defaultTypeId);
  const [typeId, setTypeId] = useState(resolvedDefaultTypeId);
  const payMode = useMemo(
    () => types.find((t) => t.id === typeId)?.pay_mode ?? "per_session",
    [types, typeId],
  );

  return (
    <>
      <SelectField
        label="課堂類型"
        name="lesson_type_id"
        required
        defaultValue={resolvedDefaultTypeId}
        options={types.map((t) => ({ value: t.id, label: t.name }))}
        onChange={(e) => setTypeId(e.currentTarget.value)}
      />
      {payMode === "per_student" ? (
        <>
          <SelectField
            label="學生"
            name="student_id"
            required
            allowEmpty
            defaultValue={defaultStudentId}
            options={students.map((s) => ({ value: s.id, label: s.name }))}
          />
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
