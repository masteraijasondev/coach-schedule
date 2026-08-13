"use server";

import { requireEmployer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function createLessonTypeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireEmployer();
    const name = String(formData.get("name") ?? "").trim();
    const duration = Number(formData.get("default_duration_minutes") ?? 60);
    const payMode = String(formData.get("pay_mode") ?? "per_session");

    if (!name) {
      return { ok: false, error: "請輸入課堂類型名稱" };
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      return { ok: false, error: "預設時長必須大於 0" };
    }
    if (!["per_student", "per_head", "per_session", "per_hour"].includes(payMode)) {
      return { ok: false, error: "薪資模式無效" };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("lesson_types").insert({
      name,
      default_duration_minutes: duration,
      pay_mode: payMode,
    });

    if (error) {
      console.error("[createLessonTypeAction]", { error });
      return { ok: false, error: "新增課堂類型失敗（名稱可能重複）" };
    }

    revalidatePath("/employer/lesson-types");
    revalidatePath("/employer/rates");
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[createLessonTypeAction] unexpected", { error });
    return { ok: false, error: "新增課堂類型時發生錯誤" };
  }
}

export async function toggleLessonTypeActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    await requireEmployer();
    const supabase = await createClient();
    const { error } = await supabase
      .from("lesson_types")
      .update({ active })
      .eq("id", id);

    if (error) {
      return { ok: false, error: "更新課堂類型失敗" };
    }

    revalidatePath("/employer/lesson-types");
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[toggleLessonTypeActiveAction] unexpected", { error });
    return { ok: false, error: "更新課堂類型時發生錯誤" };
  }
}
