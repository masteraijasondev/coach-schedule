"use client";

import { upsertCoachStudentRateAction } from "@/actions/rates";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import {
  coachPayFromFeeRatio,
  payRatioFromPercent,
} from "@/lib/pt-rate";
import { useMemo, useState } from "react";

type StudentOption = {
  id: string;
  name: string;
  listedFeeHkd: number | null;
};

export function EmployerPtRateForm({
  coaches,
  students,
}: {
  coaches: { id: string; full_name: string }[];
  students: StudentOption[];
}) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [percent, setPercent] = useState("50");
  const student = students.find((item) => item.id === studentId) ?? null;
  const ratio = useMemo(() => {
    const value = Number(percent);
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    return payRatioFromPercent(value);
  }, [percent]);
  const previewPay =
    student?.listedFeeHkd != null && ratio != null
      ? coachPayFromFeeRatio(student.listedFeeHkd, ratio)
      : null;
  const canSave = student?.listedFeeHkd != null && ratio != null;

  return (
    <ActionForm
      action={upsertCoachStudentRateAction}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <label className="block space-y-1 text-sm">
        <span className="text-stone-700">教練</span>
        <select
          name="coach_id"
          required
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
        >
          {coaches.map((coach) => (
            <option key={coach.id} value={coach.id}>
              {coach.full_name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-stone-700">學生</span>
        <select
          name="student_id"
          required
          value={studentId}
          onChange={(event) => setStudentId(event.target.value)}
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
        >
          {students.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-stone-500">
          本身學費：
          {student?.listedFeeHkd != null
            ? formatMoney(student.listedFeeHkd)
            : "Airtable 未有"}
        </p>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-stone-700">分成比例（%）</span>
        <input
          name="pay_ratio_percent"
          type="number"
          min="0"
          step="0.01"
          required
          value={percent}
          onChange={(event) => setPercent(event.target.value)}
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
        />
        <p className="text-xs text-stone-500">
          教練薪資：
          {previewPay != null ? formatMoney(previewPay) : "—"}
          （學費 × 比例）
        </p>
      </label>
      <div className="flex items-end">
        <SubmitButton disabled={!canSave}>儲存</SubmitButton>
      </div>
    </ActionForm>
  );
}
