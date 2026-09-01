"use client";

import { updateLessonFeesAction } from "@/actions/lessons";
import { ActionForm } from "@/components/action-form";
import { Field, SubmitButton } from "@/components/ui";

type Props = {
  lessonId: string;
  studentFeeHkd: number | null;
  earnedAmountHkd: number | null;
};

export function EmployerLessonFeeForm({
  lessonId,
  studentFeeHkd,
  earnedAmountHkd,
}: Props) {
  return (
    <ActionForm
      action={updateLessonFeesAction}
      className="grid gap-3 sm:grid-cols-3"
    >
      <input type="hidden" name="lesson_id" value={lessonId} />
      <Field
        label="學生學費"
        name="student_fee_hkd"
        type="number"
        min="0"
        step="0.01"
        defaultValue={studentFeeHkd == null ? "" : String(studentFeeHkd)}
      />
      <Field
        label="教練薪資"
        name="earned_amount_hkd"
        type="number"
        min="0"
        step="0.01"
        defaultValue={earnedAmountHkd == null ? "" : String(earnedAmountHkd)}
      />
      <div className="flex items-end">
        <SubmitButton>更新金額</SubmitButton>
      </div>
    </ActionForm>
  );
}
