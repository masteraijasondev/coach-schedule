import type { PayMode } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

export async function calculateLessonPay(input: {
  coachId: string;
  lessonTypeId: string;
  payMode: PayMode;
  studentId?: string | null;
  headcount?: number | null;
}): Promise<{ amount: number } | { error: string }> {
  const supabase = await createClient();

  if (input.payMode === "per_student") {
    if (!input.studentId) {
      return { error: "請選擇學生" };
    }
    const { data: rate, error } = await supabase
      .from("coach_student_rates")
      .select("amount_hkd")
      .eq("coach_id", input.coachId)
      .eq("student_id", input.studentId)
      .maybeSingle();

    if (error) {
      console.error("[calculateLessonPay] coach_student_rates", { error });
      return { error: "讀取學生薪資規則失敗" };
    }
    if (!rate) {
      return {
        error: "尚未設定此教練與學生的薪資，無法登記。請僱主先在教練頁面設定。",
      };
    }
    return { amount: Number(rate.amount_hkd) };
  }

  if (input.payMode === "per_head") {
    const count = input.headcount ?? 0;
    if (!Number.isInteger(count) || count <= 0) {
      return { error: "請輸入有效的學生人數" };
    }
    const { data: rate, error } = await supabase
      .from("coach_rates")
      .select("amount_hkd")
      .eq("coach_id", input.coachId)
      .eq("lesson_type_id", input.lessonTypeId)
      .maybeSingle();

    if (error) {
      console.error("[calculateLessonPay] coach_rates per_head", { error });
      return { error: "讀取 MIIT 薪資規則失敗" };
    }
    if (!rate) {
      return {
        error: "尚未設定此教練的 MIIT 每人薪資，無法登記。",
      };
    }
    return { amount: Number(rate.amount_hkd) * count };
  }

  const { data: rate, error } = await supabase
    .from("coach_rates")
    .select("amount_hkd")
    .eq("coach_id", input.coachId)
    .eq("lesson_type_id", input.lessonTypeId)
    .maybeSingle();

  if (error) {
    console.error("[calculateLessonPay] coach_rates per_session", { error });
    return { error: "讀取薪資規則失敗" };
  }
  if (!rate) {
    return {
      error: "尚未設定此課堂類型的薪資規則，無法登記。",
    };
  }
  return { amount: Number(rate.amount_hkd) };
}
