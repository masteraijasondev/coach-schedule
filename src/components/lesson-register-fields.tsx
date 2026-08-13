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
};

export function LessonRegisterFields({
  types,
  students,
  defaultTypeId,
  defaultStudentId,
  defaultHeadcount,
}: Props) {
  const [typeId, setTypeId] = useState(defaultTypeId ?? types[0]?.id ?? "");
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
        defaultValue={defaultTypeId}
        options={types.map((t) => ({ value: t.id, label: t.name }))}
        onChange={(e) => setTypeId(e.currentTarget.value)}
      />
      {payMode === "per_student" ? (
        <SelectField
          label="學生"
          name="student_id"
          required
          allowEmpty
          defaultValue={defaultStudentId}
          options={students.map((s) => ({ value: s.id, label: s.name }))}
        />
      ) : null}
      {payMode === "per_head" ? (
        <Field
          label="學生人數"
          name="headcount"
          type="number"
          min="1"
          step="1"
          required
          defaultValue={defaultHeadcount?.toString()}
        />
      ) : null}
    </>
  );
}
