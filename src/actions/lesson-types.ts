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
    const registersStudent = String(formData.get("registers_student") ?? "");
    if (registersStudent !== "yes" && registersStudent !== "no") {
      return { ok: false, error: "請選擇簽到時是否可加入學生" };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("lesson_types").insert({
      name,
      default_duration_minutes: duration,
      pay_mode: payMode,
      registers_student: registersStudent === "yes",
    });

    if (error) {
      console.error("[createLessonTypeAction]", { error });
      return { ok: false, error: "新增課堂類型失敗（名稱可能重複）" };
    }

    revalidatePath("/employer/lesson-types");
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[createLessonTypeAction] unexpected", { error });
    return { ok: false, error: "新增課堂類型時發生錯誤" };
  }
}

async function saveHourlyJobRates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coachId: string,
  formData: FormData,
  types: { id: string; pay_mode: string }[],
): Promise<string | null> {
  for (const type of types) {
    const priced =
      type.pay_mode === "per_hour"
        ? {
            field: `hourly_rate_${type.id}`,
            invalid: "請輸入有效的工作類型時薪",
            save: "更新工作類型時薪失敗",
          }
        : type.pay_mode === "per_head"
          ? {
              field: `head_rate_${type.id}`,
              invalid: "請輸入有效的 MIIT 每人薪資",
              save: "更新 MIIT 每人薪資失敗",
            }
          : null;
    if (!priced) {
      continue;
    }
    const raw = String(formData.get(priced.field) ?? "").trim();
    if (!raw) {
      const { error } = await supabase
        .from("coach_rates")
        .delete()
        .eq("coach_id", coachId)
        .eq("lesson_type_id", type.id);
      if (error) {
        console.error("[saveHourlyJobRates] delete", { error, coachId, typeId: type.id });
        return priced.save;
      }
      continue;
    }
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      return priced.invalid;
    }
    const { error } = await supabase.from("coach_rates").upsert(
      {
        coach_id: coachId,
        lesson_type_id: type.id,
        amount_hkd: Math.round(amount * 100) / 100,
      },
      { onConflict: "coach_id,lesson_type_id" },
    );
    if (error) {
      console.error("[saveHourlyJobRates] upsert", { error, coachId, typeId: type.id });
      return priced.save;
    }
  }
  return null;
}

export async function saveStaffWorkTypesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireEmployer();
    const coachId = String(formData.get("coach_id") ?? "").trim();
    const typeIds = [
      ...new Set(
        formData
          .getAll("lesson_type_id")
          .map((value) => String(value).trim())
          .filter(Boolean),
      ),
    ];
    if (!coachId) {
      return { ok: false, error: "找不到同事" };
    }

    const supabase = await createClient();
    const { data: coach, error: coachError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", coachId)
      .eq("role", "coach")
      .eq("active", true)
      .maybeSingle();
    if (coachError || !coach) {
      console.error("[saveStaffWorkTypesAction] coach", { error: coachError });
      return { ok: false, error: "找不到同事" };
    }

    if (typeIds.length > 0) {
      const { data: types, error: typeError } = await supabase
        .from("lesson_types")
        .select("id, pay_mode")
        .in("id", typeIds)
        .eq("active", true);
      if (typeError) {
        console.error("[saveStaffWorkTypesAction] types", { error: typeError });
        return { ok: false, error: "讀取工作類型失敗" };
      }
      if ((types ?? []).length !== typeIds.length) {
        return { ok: false, error: "只可分配啟用中的工作類型" };
      }
      const rateError = await saveHourlyJobRates(
        supabase,
        coachId,
        formData,
        types ?? [],
      );
      if (rateError) {
        return { ok: false, error: rateError };
      }
    }

    const { error: deleteError } = await supabase
      .from("staff_work_types")
      .delete()
      .eq("coach_id", coachId);
    if (deleteError) {
      console.error("[saveStaffWorkTypesAction] delete", { error: deleteError });
      return { ok: false, error: "更新工作類型失敗" };
    }

    if (typeIds.length > 0) {
      const { error: insertError } = await supabase.from("staff_work_types").insert(
        typeIds.map((lessonTypeId) => ({
          coach_id: coachId,
          lesson_type_id: lessonTypeId,
        })),
      );
      if (insertError) {
        console.error("[saveStaffWorkTypesAction] insert", { error: insertError });
        return { ok: false, error: "更新工作類型失敗" };
      }
    }

    revalidatePath("/employer");
    revalidatePath("/employer/coaches");
    revalidatePath("/coach");
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[saveStaffWorkTypesAction] unexpected", { error });
    return { ok: false, error: "更新工作類型時發生錯誤" };
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
