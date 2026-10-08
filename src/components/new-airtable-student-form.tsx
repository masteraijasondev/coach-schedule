"use client";

import { createAirtableStudentProfileAction } from "@/actions/students";
import { ActionForm } from "@/components/action-form";
import { Field, SelectField, SubmitButton } from "@/components/ui";
import { useState } from "react";

export function NewAirtableStudentForm() {
  const [generation, setGeneration] = useState(0);

  return (
    <div data-tour="coach-student-form">
    <ActionForm
      action={createAirtableStudentProfileAction}
      className="space-y-3"
      successMessage="已新增學生"
      onSuccess={() => setGeneration((current) => current + 1)}
    >
      <div key={generation} className="space-y-3">
        <Field label="姓名" name="name" required />
        <Field label="電話" name="phone" type="tel" required />
        <Field label="電郵（可稍後填寫）" name="email" type="email" />
        <SelectField
          label="性別（可稍後填寫）"
          name="gender"
          allowEmpty
          emptyLabel="未選擇"
          options={[
            { value: "男", label: "男" },
            { value: "女", label: "女" },
          ]}
        />
      </div>
      <SubmitButton>新增學生</SubmitButton>
    </ActionForm>
    </div>
  );
}
