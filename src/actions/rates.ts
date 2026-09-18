"use server";

import { lookupAirtableTuition } from "@/lib/airtable-tuition";
import { requireEmployer } from "@/lib/auth";
import {
  coachPayFromFeeRatio,
  payRatioFromPercent,
} from "@/lib/pt-rate";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function upsertCoachStudentRateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireEmployer();
    const coachId = String(formData.get("coach_id") ?? "");
    const studentId = String(formData.get("student_id") ?? "");
    const percent = Number(formData.get("pay_ratio_percent") ?? NaN);

    if (!coachId || !studentId) {
      return { ok: false, error: "請選擇教練與學生" };
    }
    if (!Number.isFinite(percent) || percent < 0) {
      return { ok: false, error: "分成比例無效" };
    }

    const supabase = await createClient();
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("name")
      .eq("id", studentId)
      .maybeSingle();
    if (studentError) {
      console.error("[upsertCoachStudentRateAction] student", {
        error: studentError,
      });
      return { ok: false, error: "讀取學生失敗" };
    }
    const studentFee = await lookupAirtableTuition(student?.name);
    if (studentFee == null) {
      return { ok: false, error: "此學生於 Airtable 尚無本身學費，無法按比例計算薪資" };
    }
    const payRatio = payRatioFromPercent(percent);
    const coachPay = coachPayFromFeeRatio(studentFee, payRatio);

    const { error } = await supabase.from("coach_student_rates").upsert(
      {
        coach_id: coachId,
        student_id: studentId,
        amount_hkd: coachPay,
        student_fee_hkd: studentFee,
        pay_ratio: payRatio,
      },
      { onConflict: "coach_id,student_id" },
    );

    if (error) {
      console.error("[upsertCoachStudentRateAction]", { error });
      return { ok: false, error: "儲存 PT 費率失敗" };
    }

    revalidatePath("/employer/coaches");
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[upsertCoachStudentRateAction] unexpected", { error });
    return { ok: false, error: "儲存 PT 費率時發生錯誤" };
  }
}

export async function upsertCoachRateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireEmployer();
    const coachId = String(formData.get("coach_id") ?? "");
    const lessonTypeId = String(formData.get("lesson_type_id") ?? "");
    const amount = Number(formData.get("amount_hkd") ?? NaN);

    if (!coachId || !lessonTypeId) {
      return { ok: false, error: "請選擇教練與課堂類型" };
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: "金額無效" };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("coach_rates").upsert(
      {
        coach_id: coachId,
        lesson_type_id: lessonTypeId,
        amount_hkd: amount,
      },
      { onConflict: "coach_id,lesson_type_id" },
    );

    if (error) {
      console.error("[upsertCoachRateAction]", { error });
      return { ok: false, error: "儲存薪資規則失敗" };
    }

    revalidatePath("/employer/rates");
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[upsertCoachRateAction] unexpected", { error });
    return { ok: false, error: "儲存薪資規則時發生錯誤" };
  }
}
