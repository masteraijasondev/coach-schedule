"use server";

import { fromZonedTime } from "date-fns-tz";
import { requireCoach, requireEmployer } from "@/lib/auth";
import { assertCoachLessonDate } from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { revalidatePath } from "next/cache";

function parseHongKongDateTime(date: string, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, TIMEZONE);
}

function assertFiveMinuteTime(time: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return "時間格式無效";
  }
  const [, minute] = time.split(":").map(Number);
  if (minute % 5 !== 0) {
    return "時間請以 5 分鐘為單位";
  }
  return null;
}

function revalidateSchedules() {
  revalidatePath("/employer");
  revalidatePath("/employer/lessons");
  revalidatePath("/coach");
  revalidatePath("/coach/salary");
}

async function assertNoCoachOverlap(
  coachId: string,
  startsAt: string,
  endsAt: string,
  excludeLessonId?: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("coach_has_overlap", {
    p_coach_id: coachId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_exclude_lesson_id: excludeLessonId ?? null,
  });

  if (error) {
    console.error("[assertNoCoachOverlap]", { error });
    return "無法檢查時間重疊";
  }

  if (data === true) {
    return "該教練在此時段已有其他課堂（不可重疊）";
  }

  return null;
}

async function getCoachRateAmount(
  coachId: string,
  lessonTypeId: string,
): Promise<{ amount: number } | { error: string }> {
  const supabase = await createClient();
  const { data: rate, error } = await supabase
    .from("coach_rates")
    .select("amount_hkd")
    .eq("coach_id", coachId)
    .eq("lesson_type_id", lessonTypeId)
    .maybeSingle();

  if (error) {
    console.error("[getCoachRateAmount]", { error });
    return { error: "讀取薪資規則失敗" };
  }

  if (!rate) {
    return {
      error:
        "尚未設定此課堂類型的薪資規則，無法登記。請先到「薪資規則」為該教練加入對應類型金額。",
    };
  }

  return { amount: Number(rate.amount_hkd) };
}

export async function createLessonAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireEmployer();

    const lessonTypeId = String(formData.get("lesson_type_id") ?? "");
    const date = String(formData.get("date") ?? "");
    const startTime = String(formData.get("start_time") ?? "");
    const endTime = String(formData.get("end_time") ?? "");
    const coachId = String(formData.get("coach_id") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const studentIds = formData.getAll("student_ids").map(String);

    if (!lessonTypeId || !date || !startTime || !endTime || !coachId) {
      return { ok: false, error: "請填寫課堂類型、時間與教練" };
    }

    const startTimeError = assertFiveMinuteTime(startTime);
    if (startTimeError) {
      return { ok: false, error: startTimeError };
    }
    const endTimeError = assertFiveMinuteTime(endTime);
    if (endTimeError) {
      return { ok: false, error: endTimeError };
    }

    const startsAt = parseHongKongDateTime(date, startTime).toISOString();
    const endsAt = parseHongKongDateTime(date, endTime).toISOString();

    if (new Date(endsAt) <= new Date(startsAt)) {
      return { ok: false, error: "結束時間必須晚於開始時間" };
    }

    const rateResult = await getCoachRateAmount(coachId, lessonTypeId);
    if ("error" in rateResult) {
      return { ok: false, error: rateResult.error };
    }

    const overlapError = await assertNoCoachOverlap(coachId, startsAt, endsAt);
    if (overlapError) {
      return { ok: false, error: overlapError };
    }

    const supabase = await createClient();
    const { data: lesson, error } = await supabase
      .from("lessons")
      .insert({
        lesson_type_id: lessonTypeId,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "completed",
        coach_id: coachId,
        earned_amount_hkd: rateResult.amount,
        notes,
      })
      .select("id")
      .single();

    if (error || !lesson) {
      console.error("[createLessonAction]", { error });
      return { ok: false, error: "建立課堂失敗" };
    }

    if (studentIds.length > 0) {
      const { error: studentsError } = await supabase
        .from("lesson_students")
        .insert(
          studentIds.map((student_id) => ({
            lesson_id: lesson.id,
            student_id,
          })),
        );

      if (studentsError) {
        console.error("[createLessonAction] students", { error: studentsError });
        return { ok: false, error: "課堂已建立，但學生連結失敗" };
      }
    }

    revalidateSchedules();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[createLessonAction] unexpected", { error });
    return { ok: false, error: "建立課堂時發生錯誤" };
  }
}

export async function createCoachLessonAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const coach = await requireCoach();

    const lessonTypeId = String(formData.get("lesson_type_id") ?? "");
    const date = String(formData.get("date") ?? "");
    const startTime = String(formData.get("start_time") ?? "");
    const endTime = String(formData.get("end_time") ?? "");

    if (!lessonTypeId || !date || !startTime || !endTime) {
      return { ok: false, error: "請填寫課堂類型與時間" };
    }

    const dateError = assertCoachLessonDate(date);
    if (dateError) {
      return { ok: false, error: dateError };
    }

    const startTimeError = assertFiveMinuteTime(startTime);
    if (startTimeError) {
      return { ok: false, error: startTimeError };
    }
    const endTimeError = assertFiveMinuteTime(endTime);
    if (endTimeError) {
      return { ok: false, error: endTimeError };
    }

    const startsAt = parseHongKongDateTime(date, startTime).toISOString();
    const endsAt = parseHongKongDateTime(date, endTime).toISOString();

    if (new Date(endsAt) <= new Date(startsAt)) {
      return { ok: false, error: "結束時間必須晚於開始時間" };
    }

    const rateResult = await getCoachRateAmount(coach.id, lessonTypeId);
    if ("error" in rateResult) {
      return { ok: false, error: rateResult.error };
    }

    const overlapError = await assertNoCoachOverlap(
      coach.id,
      startsAt,
      endsAt,
    );
    if (overlapError) {
      return { ok: false, error: overlapError };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("lessons").insert({
      lesson_type_id: lessonTypeId,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "completed",
      coach_id: coach.id,
      earned_amount_hkd: rateResult.amount,
    });

    if (error) {
      console.error("[createCoachLessonAction]", { error });
      return { ok: false, error: "登記課堂失敗" };
    }

    revalidateSchedules();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[createCoachLessonAction] unexpected", { error });
    return { ok: false, error: "登記課堂時發生錯誤" };
  }
}

export async function updateCoachLessonAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const coach = await requireCoach();
    const lessonId = String(formData.get("lesson_id") ?? "");
    const lessonTypeId = String(formData.get("lesson_type_id") ?? "");
    const date = String(formData.get("date") ?? "");
    const startTime = String(formData.get("start_time") ?? "");
    const endTime = String(formData.get("end_time") ?? "");

    if (!lessonId || !lessonTypeId || !date || !startTime || !endTime) {
      return { ok: false, error: "請填寫完整資料" };
    }

    const dateError = assertCoachLessonDate(date);
    if (dateError) {
      return { ok: false, error: dateError };
    }

    const startTimeError = assertFiveMinuteTime(startTime);
    if (startTimeError) {
      return { ok: false, error: startTimeError };
    }
    const endTimeError = assertFiveMinuteTime(endTime);
    if (endTimeError) {
      return { ok: false, error: endTimeError };
    }

    const startsAt = parseHongKongDateTime(date, startTime).toISOString();
    const endsAt = parseHongKongDateTime(date, endTime).toISOString();

    if (new Date(endsAt) <= new Date(startsAt)) {
      return { ok: false, error: "結束時間必須晚於開始時間" };
    }

    const supabase = await createClient();
    const { data: lesson } = await supabase
      .from("lessons")
      .select("*")
      .eq("id", lessonId)
      .single();

    if (!lesson || lesson.coach_id !== coach.id || lesson.status !== "completed") {
      return { ok: false, error: "只能修改自己已登記的課堂" };
    }

    const rateResult = await getCoachRateAmount(coach.id, lessonTypeId);
    if ("error" in rateResult) {
      return { ok: false, error: rateResult.error };
    }

    const overlapError = await assertNoCoachOverlap(
      coach.id,
      startsAt,
      endsAt,
      lessonId,
    );
    if (overlapError) {
      return { ok: false, error: overlapError };
    }

    const { error } = await supabase
      .from("lessons")
      .update({
        lesson_type_id: lessonTypeId,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "completed",
        earned_amount_hkd: rateResult.amount,
      })
      .eq("id", lessonId)
      .eq("status", "completed");

    if (error) {
      console.error("[updateCoachLessonAction]", { error });
      return { ok: false, error: "更新課堂失敗" };
    }

    revalidateSchedules();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[updateCoachLessonAction] unexpected", { error });
    return { ok: false, error: "更新課堂時發生錯誤" };
  }
}

export async function deleteCoachLessonAction(
  lessonId: string,
): Promise<ActionResult> {
  try {
    const coach = await requireCoach();
    const supabase = await createClient();

    const { data: lesson } = await supabase
      .from("lessons")
      .select("id, coach_id, status")
      .eq("id", lessonId)
      .single();

    if (
      !lesson ||
      lesson.coach_id !== coach.id ||
      (lesson.status !== "completed" && lesson.status !== "assigned")
    ) {
      return { ok: false, error: "只能刪除自己的課堂" };
    }

    const { error } = await supabase.from("lessons").delete().eq("id", lessonId);

    if (error) {
      console.error("[deleteCoachLessonAction]", { error });
      return { ok: false, error: "刪除課堂失敗" };
    }

    revalidateSchedules();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[deleteCoachLessonAction] unexpected", { error });
    return { ok: false, error: "刪除課堂時發生錯誤" };
  }
}

export async function cancelLessonAction(lessonId: string): Promise<ActionResult> {
  try {
    await requireEmployer();
    const supabase = await createClient();

    const { data: lesson } = await supabase
      .from("lessons")
      .select("status")
      .eq("id", lessonId)
      .single();

    if (!lesson || lesson.status === "cancelled") {
      return { ok: false, error: "無法取消此課堂" };
    }

    const { error } = await supabase
      .from("lessons")
      .update({ status: "cancelled" })
      .eq("id", lessonId);

    if (error) {
      return { ok: false, error: "取消課堂失敗" };
    }

    revalidateSchedules();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[cancelLessonAction] unexpected", { error });
    return { ok: false, error: "取消課堂時發生錯誤" };
  }
}
