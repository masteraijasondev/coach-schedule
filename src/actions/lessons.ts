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
import { lookupAirtableTuition } from "@/lib/airtable-tuition";
import { calculateLessonPay } from "@/lib/pay";
import { coachPayFromFeeRatio } from "@/lib/pt-rate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, PayMode } from "@/lib/types";
import { revalidatePath } from "next/cache";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function assertCoachAvailabilityCovers(
  coachId: string,
  startsAt: string,
  endsAt: string,
  supabase?: SupabaseServerClient,
): Promise<string | null> {
  const client = supabase ?? (await createClient());
  const { data, error } = await client.rpc("coach_availability_covers", {
    p_coach_id: coachId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });

  if (error) {
    console.error("[assertCoachAvailabilityCovers]", { error });
    return "無法檢查可返工時間";
  }

  if (data !== true) {
    return "派更時段必須完全落在該教練已申報的可返工範圍內（放假日不可派更）";
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
  supabase?: SupabaseServerClient,
): Promise<string | null> {
  const client = supabase ?? (await createClient());
  const { data, error } = await client.rpc("coach_has_overlap", {
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
  return linkLessonStudents(lessonId, studentId ? [studentId] : []);
}

async function linkLessonStudents(
  lessonId: string,
  studentIds: string[],
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("lesson_students")
    .delete()
    .eq("lesson_id", lessonId);

  if (deleteError) {
    console.error("[linkLessonStudents] delete", { error: deleteError });
    return { ok: false, error: "連結學生失敗" };
  }

  if (studentIds.length === 0) {
    return { ok: true, data: undefined };
  }

  const { error } = await supabase.from("lesson_students").insert(
    studentIds.map((studentId) => ({
      lesson_id: lessonId,
      student_id: studentId,
    })),
  );

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

    const supabase = await createClient();
    const requestedTypeId = String(formData.get("lesson_type_id") ?? "").trim();
    const [coverError, overlapError, fallbackTypeResult] = await Promise.all([
      assertCoachAvailabilityCovers(coachId, startsAt, endsAt, supabase),
      assertNoCoachOverlap(coachId, startsAt, endsAt, undefined, supabase),
      requestedTypeId
        ? Promise.resolve({ data: { id: requestedTypeId }, error: null })
        : supabase
            .from("lesson_types")
            .select("id")
            .eq("active", true)
            .order("name")
            .limit(1)
            .maybeSingle(),
    ]);
    if (coverError) {
      return { ok: false, error: coverError };
    }
    if (overlapError) {
      return { ok: false, error: overlapError };
    }

    const lessonTypeId = fallbackTypeResult.data?.id;
    if (fallbackTypeResult.error || !lessonTypeId) {
      console.error("[createLessonAction] fallback lesson type", {
        error: fallbackTypeResult.error,
      });
      return { ok: false, error: "尚未設定課堂類型，無法派更" };
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

    const releaseRemainder = String(formData.get("release_remainder") ?? "") === "1";
    const slotStart = Number(formData.get("slot_start_minute"));
    const slotEnd = Number(formData.get("slot_end_minute"));
    const assignStart = Number(startMinuteRaw);
    const assignEnd = Number(endMinuteRaw);
    if (
      releaseRemainder &&
      Number.isInteger(slotStart) &&
      Number.isInteger(slotEnd) &&
      Number.isInteger(assignStart) &&
      Number.isInteger(assignEnd)
    ) {
      const leftovers: [number, number][] = [];
      if (slotStart < assignStart) {
        leftovers.push([slotStart, assignStart]);
      }
      if (assignEnd < slotEnd) {
        leftovers.push([assignEnd, slotEnd]);
      }
      for (const [start, end] of leftovers) {
        const { error: releaseError } = await supabase.rpc(
          "release_staff_availability",
          {
            p_coach_id: coachId,
            p_date: date,
            p_start_minute: start,
            p_end_minute: end,
          },
        );
        if (releaseError) {
          console.error("[createLessonAction] release remainder", {
            error: releaseError,
            coachId,
            date,
            start,
            end,
          });
        }
      }
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

function selectedStudentIds(formData: FormData): string[] {
  const raw = String(formData.get("student_ids") ?? "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return [
          ...new Set(
            parsed.map((value) => String(value).trim()).filter(Boolean),
          ),
        ];
      }
    } catch (error) {
      console.error("[selectedStudentIds]", { error });
    }
  }
  const studentId = String(formData.get("student_id") ?? "").trim();
  return studentId ? [studentId] : [];
}

function confirmLessonErrorMessage(message: string): string {
  if (message.includes("still in the future")) {
    return "只可簽到已經結束的時段";
  }
  if (message.includes("pending assignments")) {
    return "僅已派更、待簽到的時段可以確認簽到";
  }
  if (message.includes("not found")) {
    return "找不到課堂";
  }
  if (message.includes("At least one check-in")) {
    return "請加入至少一個簽到時段";
  }
  if (message.includes("Work type is required")) {
    return "請選擇實際工作類型";
  }
  if (message.includes("not assigned to this staff")) {
    return "此工作類型未分配給你";
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

async function confirmLessonPeriodsForStaff(
  staffId: string,
  formData: FormData,
  actor: "staff" | "employer",
): Promise<ActionResult> {
  try {
    const lessonId = String(formData.get("lesson_id") ?? "");
    const parsed = parseCheckInPeriods(String(formData.get("periods") ?? ""));
    const lessonTypeId = String(formData.get("lesson_type_id") ?? "").trim();
    if (!lessonId) {
      return { ok: false, error: "找不到課堂" };
    }
    if (!lessonTypeId) {
      return { ok: false, error: "請選擇實際工作類型" };
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
      .eq("coach_id", staffId)
      .maybeSingle();

    if (lessonError) {
      console.error("[confirmLessonPeriodsAction] load", { error: lessonError });
      return { ok: false, error: "讀取派更失敗" };
    }
    if (!lesson || (lesson.status !== "assigned" && lesson.status !== "completed")) {
      return { ok: false, error: "僅已派更或已簽到的時段可以確認或修改簽到" };
    }

    const [{ data: allowedType, error: allowedError }, { data: activeType, error: typeError }] =
      await Promise.all([
        supabase
          .from("staff_work_types")
          .select("lesson_type_id")
          .eq("coach_id", staffId)
          .eq("lesson_type_id", lessonTypeId)
          .maybeSingle(),
        supabase
          .from("lesson_types")
          .select("id")
          .eq("id", lessonTypeId)
          .eq("active", true)
          .maybeSingle(),
      ]);
    if (allowedError || typeError) {
      console.error("[confirmLessonPeriodsAction] work type", {
        error: allowedError ?? typeError,
        lessonId,
      });
      return { ok: false, error: "讀取工作類型失敗" };
    }
    if (!allowedType || !activeType) {
      return {
        ok: false,
        error:
          actor === "employer"
            ? "此工作類型未分配給這位同事"
            : "此工作類型未分配給你",
      };
    }

    const window = lessonMinutesInHongKong(lesson.starts_at, lesson.ends_at);
    let windowStart = window.startMinute;
    let windowEnd = window.endMinute;
    if (lesson.status === "completed") {
      const { data: covers, error: coverError } = await supabase
        .from("staff_availabilities")
        .select("start_minute, end_minute")
        .eq("coach_id", staffId)
        .eq("available_date", window.date)
        .eq("released", false)
        .lte("start_minute", window.startMinute)
        .gte("end_minute", window.endMinute)
        .order("start_minute", { ascending: true })
        .limit(1);
      if (coverError) {
        console.error("[confirmLessonPeriodsAction] availability", {
          error: coverError,
          lessonId,
        });
        return { ok: false, error: "讀取可返工時間失敗" };
      }
      const cover = covers?.[0];
      if (cover) {
        windowStart = cover.start_minute;
        windowEnd = cover.end_minute;
      }
    }
    const now = new Date();
    const nowMinute =
      Number(formatInTimeZone(now, TIMEZONE, "H")) * 60 +
      Number(formatInTimeZone(now, TIMEZONE, "m"));
    const periodError = assertCheckInPeriods(
      parsed.periods,
      windowStart,
      windowEnd,
      pastCheckInEndMinute(
        window.date,
        windowStart,
        windowEnd,
        hongKongToday(),
        nowMinute,
      ),
    );
    if (periodError) {
      return { ok: false, error: periodError };
    }

    const { data: staffProfile, error: staffError } = await supabase
      .from("profiles")
      .select("staff_kind, hourly_rate_hkd, pay_ratio")
      .eq("id", staffId)
      .maybeSingle();
    if (staffError || !staffProfile) {
      console.error("[confirmLessonPeriodsAction] profile", { error: staffError });
      return { ok: false, error: "讀取薪資設定失敗" };
    }

    const isAdmin = staffProfile.staff_kind === "operations";
    const studentIds = selectedStudentIds(formData);
    let sessionAmount: number | null = null;
    let tuition: number | null = null;
    if (isAdmin) {
      const hourly = Number(staffProfile.hourly_rate_hkd);
      if (!Number.isFinite(hourly) || hourly < 0) {
        return { ok: false, error: "尚未設定 Admin 時薪" };
      }
      sessionAmount = hourly;
    } else {
      if (studentIds.length === 0) {
        return { ok: false, error: "請選擇教了哪位學生" };
      }
      const ratio = Number(staffProfile.pay_ratio);
      if (!Number.isFinite(ratio) || ratio < 0) {
        return { ok: false, error: "尚未設定 Coach 分成比例" };
      }
      const { data: studentRows, error: studentError } = await supabase
        .from("students")
        .select("id, name")
        .in("id", studentIds);
      if (studentError || (studentRows ?? []).length !== studentIds.length) {
        return { ok: false, error: "找不到學生" };
      }
      let pay = 0;
      let fee = 0;
      for (const student of studentRows ?? []) {
        try {
          const listed = await lookupAirtableTuition(student.name);
          if (listed != null) {
            fee += listed;
            pay += coachPayFromFeeRatio(listed, ratio);
          }
        } catch (lookupError) {
          console.error("[confirmLessonPeriodsAction] tuition", { error: lookupError });
          return { ok: false, error: "讀取學生學費失敗" };
        }
      }
      tuition = fee > 0 ? fee : null;
      sessionAmount = pay;
      const linked = await linkLessonStudents(lessonId, studentIds);
      if (!linked.ok) {
        return linked;
      }
    }

    const periodsWithPay: {
      start_minute: number;
      end_minute: number;
      earned_amount_hkd: number | null;
    }[] = [];

    const sortedPeriods = [...parsed.periods].sort(
      (a, b) => a.startMinute - b.startMinute,
    );
    sortedPeriods.forEach((period, index) => {
      const startsAt = parseHongKongDateTime(
        window.date,
        minutesToClock(period.startMinute),
      ).toISOString();
      const endsAt = parseHongKongDateTime(
        window.date,
        minutesToClock(period.endMinute),
      ).toISOString();
      if (new Date(endsAt) > now) {
        return;
      }
      const durationMinutes =
        (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000;
      const amount = isAdmin
        ? Math.round((sessionAmount ?? 0) * (durationMinutes / 60) * 100) / 100
        : index === 0
          ? sessionAmount
          : 0;
      periodsWithPay.push({
        start_minute: period.startMinute,
        end_minute: period.endMinute,
        earned_amount_hkd: amount,
      });
    });
    if (periodsWithPay.length !== sortedPeriods.length) {
      return { ok: false, error: "只可簽到已經結束的時段" };
    }

    const { error } = await supabase.rpc("confirm_staff_lesson_periods", {
      p_id: lessonId,
      p_periods: periodsWithPay,
      p_lesson_type_id: lessonTypeId,
    });

    if (error) {
      console.error("[confirmLessonPeriodsAction]", { error, lessonId });
      return { ok: false, error: confirmLessonErrorMessage(error.message) };
    }

    if (!isAdmin && tuition != null) {
      const { error: feeError } = await createAdminClient()
        .from("lessons")
        .update({ student_fee_hkd: tuition })
        .eq("id", lessonId)
        .eq("coach_id", staffId);
      if (feeError) {
        console.error("[confirmLessonPeriodsAction] student fee", { error: feeError, lessonId });
      }
    }

    revalidateSchedules();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[confirmLessonPeriodsAction] unexpected", { error });
    return { ok: false, error: "確認簽到時發生錯誤" };
  }
}

export async function confirmLessonPeriodsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const coach = await requireCoach();
  return confirmLessonPeriodsForStaff(coach.id, formData, "staff");
}

export async function employerEditCheckInAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmployer();
  const lessonId = String(formData.get("lesson_id") ?? "");
  const supabase = await createClient();
  const { data: lesson, error } = await supabase
    .from("lessons")
    .select("coach_id")
    .eq("id", lessonId)
    .maybeSingle();
  if (error || !lesson?.coach_id) {
    console.error("[employerEditCheckInAction] lesson", { error, lessonId });
    return { ok: false, error: "找不到課堂" };
  }
  return confirmLessonPeriodsForStaff(lesson.coach_id, formData, "employer");
}

export async function markAssignmentSickLeaveAction(
  lessonId: string,
): Promise<ActionResult> {
  try {
    await requireEmployer();
    const supabase = await createClient();
    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select("id, coach_id, starts_at, ends_at, status")
      .eq("id", lessonId)
      .maybeSingle();
    if (lessonError || !lesson?.coach_id || lesson.status !== "assigned") {
      console.error("[markAssignmentSickLeaveAction] load", { error: lessonError, lessonId });
      return { ok: false, error: "只可將待簽到的派更轉為病假" };
    }

    const window = lessonMinutesInHongKong(lesson.starts_at, lesson.ends_at);
    const admin = createAdminClient();
    const { error: leaveError } = await admin.from("staff_leaves").insert({
      coach_id: lesson.coach_id,
      leave_date: window.date,
      start_minute: window.startMinute,
      end_minute: window.endMinute,
      kind: "sick",
    });
    if (leaveError) {
      console.error("[markAssignmentSickLeaveAction] leave", { error: leaveError, lessonId });
      return { ok: false, error: "轉為病假失敗" };
    }

    const { error } = await supabase
      .from("lessons")
      .update({ status: "cancelled" })
      .eq("id", lessonId);
    if (error) {
      console.error("[markAssignmentSickLeaveAction] cancel", { error, lessonId });
      return { ok: false, error: "已記下病假，但未能取消原派更" };
    }

    revalidateSchedules();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[markAssignmentSickLeaveAction] unexpected", { error });
    return { ok: false, error: "轉為病假時發生錯誤" };
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
              pay_ratio:
                studentFee > 0
                  ? Math.round((coachPay / studentFee) * 10000) / 10000
                  : null,
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
