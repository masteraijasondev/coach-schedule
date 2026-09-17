"use server";

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { requireCoach, requireEmployer } from "@/lib/auth";
import { addDaysToYmd, lessonMinutesInHongKong, hongKongToday } from "@/lib/calendar";
import {
  assertCheckInPeriods,
  parseCheckInPeriods,
  pastCheckInEndMinute,
} from "@/lib/check-in";
import { TIMEZONE } from "@/lib/constants";
import { calculateLessonPay } from "@/lib/pay";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, PayMode } from "@/lib/types";
import { revalidatePath } from "next/cache";

async function assertCoachAvailabilityCovers(
  coachId: string,
  startsAt: string,
  endsAt: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("coach_availability_covers", {
    p_coach_id: coachId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });

  if (error) {
    console.error("[assertCoachAvailabilityCovers]", { error });
    return "無法檢查可返工時間";
  }

  if (data !== true) {
    return "派更時段必須完全落在該教練已報可返工範圍內（放假日不可派）";
  }

  return null;
}

function parseHongKongDateTime(date: string, time: string): Date {
  if (time === "24:00") {
    return fromZonedTime(`${addDaysToYmd(date, 1)}T00:00:00`, TIMEZONE);
  }
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

    const date = String(formData.get("date") ?? "");
    const coachId = String(formData.get("coach_id") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const startMinuteRaw = String(formData.get("start_minute") ?? "");
    const endMinuteRaw = String(formData.get("end_minute") ?? "");

    let startTime = String(formData.get("start_time") ?? "");
    let endTime = String(formData.get("end_time") ?? "");
    if (startMinuteRaw !== "" || endMinuteRaw !== "") {
      const startMinute = Number(startMinuteRaw);
      const endMinute = Number(endMinuteRaw);
      if (
        !Number.isInteger(startMinute) ||
        !Number.isInteger(endMinute) ||
        startMinute < 0 ||
        endMinute > 1440 ||
        endMinute <= startMinute
      ) {
        return { ok: false, error: "請選擇有效的派更時段" };
      }
      startTime = minutesToClock(startMinute);
      endTime = minutesToClock(endMinute);
    }

    if (!date || !startTime || !endTime || !coachId) {
      return { ok: false, error: "請填寫時間與教練" };
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

    const coverError = await assertCoachAvailabilityCovers(
      coachId,
      startsAt,
      endsAt,
    );
    if (coverError) {
      return { ok: false, error: coverError };
    }

    const overlapError = await assertNoCoachOverlap(coachId, startsAt, endsAt);
    if (overlapError) {
      return { ok: false, error: overlapError };
    }

    const supabase = await createClient();
    let lessonTypeId = String(formData.get("lesson_type_id") ?? "").trim();
    if (!lessonTypeId) {
      const { data: fallbackType, error: typeError } = await supabase
        .from("lesson_types")
        .select("id")
        .eq("active", true)
        .order("name")
        .limit(1)
        .maybeSingle();
      if (typeError || !fallbackType) {
        console.error("[createLessonAction] fallback lesson type", {
          error: typeError,
        });
        return { ok: false, error: "尚未設定課堂類型，無法派更" };
      }
      lessonTypeId = fallbackType.id;
    }

    const { data: lesson, error } = await supabase
      .from("lessons")
      .insert({
        lesson_type_id: lessonTypeId,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "assigned",
        coach_id: coachId,
        earned_amount_hkd: null,
        student_fee_hkd: null,
        headcount: null,
        expected_headcount: null,
        notes,
      })
      .select("id")
      .single();

    if (error || !lesson) {
      console.error("[createLessonAction]", { error });
      return { ok: false, error: "派更失敗" };
    }

    revalidateSchedules();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[createLessonAction] unexpected", { error });
    return { ok: false, error: "派更時發生錯誤" };
  }
}

function minutesToClock(minutes: number): string {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

function confirmLessonErrorMessage(message: string): string {
  if (message.includes("still in the future")) {
    return "只可簽到已經過去的時段";
  }
  if (message.includes("pending assignments")) {
    return "只有待確認的派更可以確認";
  }
  if (message.includes("not found")) {
    return "找不到課堂";
  }
  if (message.includes("At least one check-in")) {
    return "請加入至少一個簽到時段";
  }
  if (message.includes("outside the assignment")) {
    return "簽到時段必須完全落在派更範圍內";
  }
  if (message.includes("overlap")) {
    return "簽到時段不可重疊";
  }
  if (message.includes("invalid")) {
    return "簽到時段無效";
  }
  return "確認簽到失敗";
}

export async function confirmLessonPeriodsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const coach = await requireCoach();
    const lessonId = String(formData.get("lesson_id") ?? "");
    const parsed = parseCheckInPeriods(String(formData.get("periods") ?? ""));
    if (!lessonId) {
      return { ok: false, error: "找不到課堂" };
    }
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    const supabase = await createClient();
    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select(
        "id, lesson_type_id, starts_at, ends_at, status, coach_id, headcount, expected_headcount",
      )
      .eq("id", lessonId)
      .eq("coach_id", coach.id)
      .maybeSingle();

    if (lessonError) {
      console.error("[confirmLessonPeriodsAction] load", { error: lessonError });
      return { ok: false, error: "讀取派更失敗" };
    }
    if (!lesson || lesson.status !== "assigned") {
      return { ok: false, error: "只有待確認的派更可以確認" };
    }

    const window = lessonMinutesInHongKong(lesson.starts_at, lesson.ends_at);
    const now = new Date();
    const nowMinute =
      Number(formatInTimeZone(now, TIMEZONE, "H")) * 60 +
      Number(formatInTimeZone(now, TIMEZONE, "m"));
    const periodError = assertCheckInPeriods(
      parsed.periods,
      window.startMinute,
      window.endMinute,
      pastCheckInEndMinute(
        window.date,
        window.startMinute,
        window.endMinute,
        hongKongToday(),
        nowMinute,
      ),
    );
    if (periodError) {
      return { ok: false, error: periodError };
    }

    const { data: link } = await supabase
      .from("lesson_students")
      .select("student_id")
      .eq("lesson_id", lessonId)
      .maybeSingle();

    const periodsWithPay: {
      start_minute: number;
      end_minute: number;
      earned_amount_hkd: number | null;
    }[] = [];

    for (const period of [...parsed.periods].sort(
      (a, b) => a.startMinute - b.startMinute,
    )) {
      const startsAt = parseHongKongDateTime(
        window.date,
        minutesToClock(period.startMinute),
      ).toISOString();
      const endsAt = parseHongKongDateTime(
        window.date,
        minutesToClock(period.endMinute),
      ).toISOString();
      if (new Date(endsAt) > now) {
        return { ok: false, error: "只可簽到已經過去的時段" };
      }
      const rateResult = await resolveLessonPay({
        coachId: coach.id,
        lessonTypeId: lesson.lesson_type_id,
        studentId: link?.student_id ?? null,
        headcountRaw:
          lesson.headcount == null ? "" : String(lesson.headcount),
        expectedHeadcountRaw:
          lesson.expected_headcount == null
            ? ""
            : String(lesson.expected_headcount),
        startsAt,
        endsAt,
      });
      if ("error" in rateResult) {
        return { ok: false, error: rateResult.error };
      }
      periodsWithPay.push({
        start_minute: period.startMinute,
        end_minute: period.endMinute,
        earned_amount_hkd: rateResult.amount,
      });
    }

    const { error } = await supabase.rpc("confirm_staff_lesson_periods", {
      p_id: lessonId,
      p_periods: periodsWithPay,
    });

    if (error) {
      console.error("[confirmLessonPeriodsAction]", { error, lessonId });
      return { ok: false, error: confirmLessonErrorMessage(error.message) };
    }

    revalidateSchedules();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[confirmLessonPeriodsAction] unexpected", { error });
    return { ok: false, error: "確認簽到時發生錯誤" };
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
