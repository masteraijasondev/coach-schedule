"use server";

import { requireEmployer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { revalidatePath } from "next/cache";

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
