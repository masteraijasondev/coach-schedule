"use server";

import { fromZonedTime } from "date-fns-tz";
import { requireCoach, requireEmployer } from "@/lib/auth";
import { assertCoachLessonDate } from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import { calculateLessonPay } from "@/lib/pay";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, PayMode } from "@/lib/types";
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
  revalidatePath("/employer/salary");
  revalidatePath("/coach");
  revalidatePath("/coach/salary");
}

function parseOptionalCount(raw: string): number | null {
  if (raw.trim() === "") {
    return null;
  }
  const count = Number(raw);
  if (!Number.isInteger(count) || count <= 0) {
    return null;
  }
  return count;
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

async function getLessonTypePayMode(
  lessonTypeId: string,
): Promise<PayMode | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_types")
    .select("pay_mode")
    .eq("id", lessonTypeId)
    .single();

  if (error || !data) {
    console.error("[getLessonTypePayMode]", { error });
    return { error: "讀取課堂類型失敗" };
  }

  return data.pay_mode as PayMode;
}

const PT_RATIOS = new Set([1, 2, 3]);

function parseOptionalMoney(
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw.trim() === "") {
    return { ok: true, value: null };
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "金額無效" };
  }
  return { ok: true, value: amount };
}

async function resolveLessonPay(input: {
  coachId: string;
  lessonTypeId: string;
  studentId?: string | null;
  headcountRaw?: string;
  expectedHeadcountRaw?: string;
  startsAt: string;
  endsAt: string;
}): Promise<
  | {
      amount: number | null;
      studentId?: string;
      studentFeeHkd?: number | null;
      headcount?: number;
      expectedHeadcount?: number;
    }
  | { error: string }
> {
  const payModeResult = await getLessonTypePayMode(input.lessonTypeId);
  if (typeof payModeResult === "object" && "error" in payModeResult) {
    return payModeResult;
  }

  const headcount = parseOptionalCount(input.headcountRaw ?? "");
  const expectedHeadcount = parseOptionalCount(
    input.expectedHeadcountRaw ?? "",
  );

  if ((input.headcountRaw ?? "").trim() !== "" && headcount == null) {
    return {
      error:
        payModeResult === "per_student"
          ? "請選擇 1:1、1:2 或 1:3"
          : "實際人數必須為正整數",
    };
  }
  if (
    (input.expectedHeadcountRaw ?? "").trim() !== "" &&
    expectedHeadcount == null
  ) {
    return { error: "應到人數必須為正整數" };
  }

  if (payModeResult === "per_student") {
    if (!input.studentId) {
      return { error: "請選擇學生" };
    }
    if (headcount == null || !PT_RATIOS.has(headcount)) {
      return { error: "請選擇 1:1、1:2 或 1:3" };
    }
  }

  if (payModeResult === "per_head" && headcount == null) {
    return { error: "請輸入實際人數" };
  }

  const durationMinutes =
    (new Date(input.endsAt).getTime() - new Date(input.startsAt).getTime()) /
    60_000;

  const payResult = await calculateLessonPay({
    coachId: input.coachId,
    lessonTypeId: input.lessonTypeId,
    payMode: payModeResult,
    studentId: payModeResult === "per_student" ? input.studentId : undefined,
    headcount: payModeResult === "per_head" ? headcount : undefined,
    durationMinutes,
  });

  if ("error" in payResult) {
    return payResult;
  }

  return {
    amount: payResult.amount,
    studentId:
      payModeResult === "per_student" ? input.studentId ?? undefined : undefined,
    studentFeeHkd: payResult.studentFeeHkd,
    headcount:
      payModeResult === "per_student" || payModeResult === "per_head"
        ? headcount ?? undefined
        : undefined,
    expectedHeadcount:
      payModeResult === "per_head" ? expectedHeadcount ?? undefined : undefined,
  };
}

async function linkLessonStudent(
  lessonId: string,
  studentId: string | undefined,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("lesson_students")
    .delete()
    .eq("lesson_id", lessonId);

  if (deleteError) {
    console.error("[linkLessonStudent] delete", { error: deleteError });
    return { ok: false, error: "連結學生失敗" };
  }

  if (!studentId) {
    return { ok: true, data: undefined };
  }

  const { error } = await supabase.from("lesson_students").insert({
    lesson_id: lessonId,
    student_id: studentId,
  });

  if (error) {
    console.error("[linkLessonStudent]", { error });
    return { ok: false, error: "連結學生失敗" };
  }

  return { ok: true, data: undefined };
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
    const studentId = String(formData.get("student_id") ?? "").trim() || null;
    const headcountRaw = String(formData.get("headcount") ?? "");
    const expectedHeadcountRaw = String(formData.get("expected_headcount") ?? "");

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

    const rateResult = await resolveLessonPay({
      coachId,
      lessonTypeId,
      studentId,
      headcountRaw,
      expectedHeadcountRaw,
      startsAt,
      endsAt,
    });
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
        student_fee_hkd: rateResult.studentFeeHkd ?? null,
        headcount: rateResult.headcount ?? null,
        expected_headcount: rateResult.expectedHeadcount ?? null,
        notes,
      })
      .select("id")
      .single();

    if (error || !lesson) {
      console.error("[createLessonAction]", { error });
      return { ok: false, error: "建立課堂失敗" };
    }

    const linkResult = await linkLessonStudent(lesson.id, rateResult.studentId);
    if (!linkResult.ok) {
      return linkResult;
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
    const studentId = String(formData.get("student_id") ?? "").trim() || null;
    const headcountRaw = String(formData.get("headcount") ?? "");
    const expectedHeadcountRaw = String(formData.get("expected_headcount") ?? "");

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

    const rateResult = await resolveLessonPay({
      coachId: coach.id,
      lessonTypeId,
      studentId,
      headcountRaw,
      expectedHeadcountRaw,
      startsAt,
      endsAt,
    });
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
    const { data: lesson, error } = await supabase
      .from("lessons")
      .insert({
        lesson_type_id: lessonTypeId,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "completed",
        coach_id: coach.id,
        earned_amount_hkd: rateResult.amount,
        student_fee_hkd: rateResult.studentFeeHkd ?? null,
        headcount: rateResult.headcount ?? null,
        expected_headcount: rateResult.expectedHeadcount ?? null,
      })
      .select("id")
      .single();

    if (error || !lesson) {
      console.error("[createCoachLessonAction]", { error });
      return { ok: false, error: "登記課堂失敗" };
    }

    const linkResult = await linkLessonStudent(lesson.id, rateResult.studentId);
    if (!linkResult.ok) {
      return linkResult;
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
    const studentId = String(formData.get("student_id") ?? "").trim() || null;
    const headcountRaw = String(formData.get("headcount") ?? "");
    const expectedHeadcountRaw = String(formData.get("expected_headcount") ?? "");

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

    const rateResult = await resolveLessonPay({
      coachId: coach.id,
      lessonTypeId,
      studentId,
      headcountRaw,
      expectedHeadcountRaw,
      startsAt,
      endsAt,
    });
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

    const { data: existingLink } = await supabase
      .from("lesson_students")
      .select("student_id")
      .eq("lesson_id", lessonId)
      .maybeSingle();

    const sameStudent =
      (rateResult.studentId ?? null) === (existingLink?.student_id ?? null);
    const earnedAmount =
      rateResult.amount ?? (sameStudent ? lesson.earned_amount_hkd : null);
    const studentFee =
      rateResult.studentFeeHkd ??
      (sameStudent ? lesson.student_fee_hkd : null);

    const { error } = await supabase
      .from("lessons")
      .update({
        lesson_type_id: lessonTypeId,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "completed",
        earned_amount_hkd: earnedAmount,
        student_fee_hkd: studentFee,
        headcount: rateResult.headcount ?? null,
        expected_headcount: rateResult.expectedHeadcount ?? null,
      })
      .eq("id", lessonId)
      .eq("status", "completed");

    if (error) {
      console.error("[updateCoachLessonAction]", { error });
      return { ok: false, error: "更新課堂失敗" };
    }

    const linkResult = await linkLessonStudent(lessonId, rateResult.studentId);
    if (!linkResult.ok) {
      return linkResult;
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

export async function updateLessonFeesAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireEmployer();
    const lessonId = String(formData.get("lesson_id") ?? "");
    const studentFeeResult = parseOptionalMoney(
      String(formData.get("student_fee_hkd") ?? ""),
    );
    const coachPayResult = parseOptionalMoney(
      String(formData.get("earned_amount_hkd") ?? ""),
    );

    if (!lessonId) {
      return { ok: false, error: "找不到課堂" };
    }
    if (!studentFeeResult.ok) {
      return { ok: false, error: "學生學費金額無效" };
    }
    if (!coachPayResult.ok) {
      return { ok: false, error: "教練薪資金額無效" };
    }
    const studentFee = studentFeeResult.value;
    const coachPay = coachPayResult.value;

    const supabase = await createClient();
    const { data: lesson } = await supabase
      .from("lessons")
      .select("id, coach_id, status, earned_amount_hkd, student_fee_hkd")
      .eq("id", lessonId)
      .single();

    if (!lesson || lesson.status === "cancelled") {
      return { ok: false, error: "無法更新此課堂金額" };
    }

    const { error } = await supabase
      .from("lessons")
      .update({
        student_fee_hkd: studentFee,
        earned_amount_hkd: coachPay,
      })
      .eq("id", lessonId);

    if (error) {
      console.error("[updateLessonFeesAction]", { error });
      return { ok: false, error: "更新金額失敗" };
    }

    const wasUnpriced =
      lesson.student_fee_hkd == null && lesson.earned_amount_hkd == null;
    if (
      wasUnpriced &&
      studentFee != null &&
      coachPay != null &&
      lesson.coach_id
    ) {
      const { data: link } = await supabase
        .from("lesson_students")
        .select("student_id")
        .eq("lesson_id", lessonId)
        .maybeSingle();

      if (link) {
        const { error: rateError } = await supabase
          .from("coach_student_rates")
          .upsert(
            {
              coach_id: lesson.coach_id,
              student_id: link.student_id,
              amount_hkd: coachPay,
              student_fee_hkd: studentFee,
            },
            { onConflict: "coach_id,student_id" },
          );

        if (rateError) {
          console.error("[updateLessonFeesAction] upsert rate", {
            error: rateError,
          });
          return { ok: false, error: "課堂金額已更新，但未能寫入預設費率" };
        }
      }
    }

    revalidateSchedules();
    revalidatePath("/employer/coaches");
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[updateLessonFeesAction] unexpected", { error });
    return { ok: false, error: "更新金額時發生錯誤" };
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
