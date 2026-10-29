"use server";

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { requireCoach, requireEmployer, requireProfile } from "@/lib/auth";
import { addDaysToYmd, lessonMinutesInHongKong, hongKongToday } from "@/lib/calendar";
import {
  assertCheckInPeriods,
  parseCheckInPeriods,
  pastCheckInEndMinute,
} from "@/lib/check-in";
import { TIMEZONE } from "@/lib/constants";
import { lookupAirtableTuitions } from "@/lib/airtable-tuition";
import type { SlotWindow } from "@/lib/fee-ledger";
import { quoteMiitLessonPay, quotePtLessonPay } from "@/lib/lesson-pay";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, PayMode } from "@/lib/types";
import { revalidatePath } from "next/cache";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const SHIFT_STEP_MINUTES = 15;

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

async function assertCoachNotOnLeave(
  coachId: string,
  date: string,
  startMinute: number,
  endMinute: number,
  supabase: SupabaseServerClient,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("staff_leaves")
    .select("start_minute, end_minute")
    .eq("coach_id", coachId)
    .eq("leave_date", date);

  if (error) {
    console.error("[assertCoachNotOnLeave]", { error });
    return "無法檢查放假紀錄";
  }

  for (const leave of data ?? []) {
    if (leave.start_minute == null) {
      return "該員工當日全日放假，不可派更";
    }
    if (
      leave.start_minute < endMinute &&
      (leave.end_minute ?? 0) > startMinute
    ) {
      return "派更時段與放假或小休重疊";
    }
  }
  return null;
}

type MinuteRange = { start: number; end: number };

function uncoveredAvailabilityGaps(
  ranges: MinuteRange[],
  startMinute: number,
  endMinute: number,
): MinuteRange[] {
  const clipped = ranges
    .map((range) => ({
      start: Math.max(range.start, startMinute),
      end: Math.min(range.end, endMinute),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: MinuteRange[] = [];
  for (const range of clipped) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) {
      merged.push({ ...range });
      continue;
    }
    last.end = Math.max(last.end, range.end);
  }

  const gaps: MinuteRange[] = [];
  let cursor = startMinute;
  for (const range of merged) {
    if (range.start > cursor) {
      gaps.push({ start: cursor, end: range.start });
    }
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < endMinute) {
    gaps.push({ start: cursor, end: endMinute });
  }
  return gaps;
}

async function ensureOpenAvailability(
  coachId: string,
  date: string,
  startMinute: number,
  endMinute: number,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("staff_availabilities")
    .select("start_minute, end_minute")
    .eq("coach_id", coachId)
    .eq("available_date", date)
    .eq("released", false);

  if (error) {
    console.error("[ensureOpenAvailability] load", { error });
    return "無法準備派更時段";
  }

  const gaps = uncoveredAvailabilityGaps(
    (data ?? []).map((row) => ({
      start: row.start_minute,
      end: row.end_minute,
    })),
    startMinute,
    endMinute,
  );

  for (const gap of gaps) {
    const { error: insertError } = await admin.from("staff_availabilities").insert({
      coach_id: coachId,
      available_date: date,
      start_minute: gap.start,
      end_minute: gap.end,
      released: false,
    });
    if (insertError) {
      console.error("[ensureOpenAvailability] insert", { insertError, gap });
      return "無法準備派更時段";
    }
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

function revalidateCalendar() {
  revalidatePath("/employer");
  revalidatePath("/employer/lessons");
  revalidatePath("/coach");
}

function revalidatePay() {
  revalidatePath("/employer/salary");
  revalidatePath("/coach/salary");
}

function revalidateSchedules() {
  revalidateCalendar();
  revalidatePay();
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
        endMinute <= startMinute ||
        startMinute % SHIFT_STEP_MINUTES !== 0 ||
        endMinute % SHIFT_STEP_MINUTES !== 0
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

    const assignStartMinute =
      startMinuteRaw !== ""
        ? Number(startMinuteRaw)
        : Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5));
    const assignEndMinute =
      endMinuteRaw !== ""
        ? Number(endMinuteRaw)
        : endTime === "24:00"
          ? 1440
          : Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5));
    const directAssign = String(formData.get("direct") ?? "") === "1";

    const supabase = await createClient();
    const requestedTypeId = String(formData.get("lesson_type_id") ?? "").trim();
    const leaveError = await assertCoachNotOnLeave(
      coachId,
      date,
      assignStartMinute,
      assignEndMinute,
      supabase,
    );
    if (leaveError) {
      return { ok: false, error: leaveError };
    }

    const [coverError, overlapError, fallbackTypeResult] = await Promise.all([
      directAssign
        ? Promise.resolve(null)
        : assertCoachAvailabilityCovers(coachId, startsAt, endsAt, supabase),
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

    if (directAssign) {
      const availabilityError = await ensureOpenAvailability(
        coachId,
        date,
        assignStartMinute,
        assignEndMinute,
      );
      if (availabilityError) {
        return { ok: false, error: availabilityError };
      }
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

    revalidateCalendar();
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

function uncoveredAssignmentMinutes(
  assignStart: number,
  assignEnd: number,
  periods: { startMinute: number; endMinute: number }[],
): { startMinute: number; endMinute: number }[] {
  const sorted = [...periods].sort((left, right) => left.startMinute - right.startMinute);
  const gaps: { startMinute: number; endMinute: number }[] = [];
  let cursor = assignStart;
  for (const period of sorted) {
    const start = Math.max(period.startMinute, assignStart);
    const end = Math.min(period.endMinute, assignEnd);
    if (start > cursor) {
      gaps.push({ startMinute: cursor, endMinute: start });
    }
    if (end > cursor) {
      cursor = end;
    }
  }
  if (cursor < assignEnd) {
    gaps.push({ startMinute: cursor, endMinute: assignEnd });
  }
  return gaps;
}

async function keepUnregisteredAssignment(input: {
  lessonId: string;
  coachId: string;
  date: string;
  assignStart: number;
  assignEnd: number;
  periods: { startMinute: number; endMinute: number }[];
  lessonTypeId: string | null;
  headcount: number | null;
  expectedHeadcount: number | null;
  notes: string | null;
}): Promise<string | null> {
  const gaps = uncoveredAssignmentMinutes(
    input.assignStart,
    input.assignEnd,
    input.periods,
  );
  if (gaps.length === 0) {
    return null;
  }
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("lessons")
    .select("starts_at, ends_at, status")
    .eq("coach_id", input.coachId)
    .in("status", ["assigned", "completed"]);
  if (existingError) {
    console.error("[keepUnregisteredAssignment] existing", {
      error: existingError,
      lessonId: input.lessonId,
    });
    return "餘下時段未能保留為待簽到";
  }
  const covered = (existing ?? []).map((lesson) =>
    lessonMinutesInHongKong(lesson.starts_at, lesson.ends_at),
  );
  const { data: studentLinks, error: studentError } = await admin
    .from("lesson_students")
    .select("student_id")
    .eq("lesson_id", input.lessonId);
  if (studentError) {
    console.error("[keepUnregisteredAssignment] students", {
      error: studentError,
      lessonId: input.lessonId,
    });
    return "餘下時段未能保留為待簽到";
  }
  const studentIds = (studentLinks ?? []).map((link) => link.student_id);
  for (const gap of gaps) {
    const alreadyCovered = covered.some(
      (range) =>
        range.date === input.date &&
        range.startMinute <= gap.startMinute &&
        range.endMinute >= gap.endMinute,
    );
    if (alreadyCovered) {
      continue;
    }
    const startsAt = parseHongKongDateTime(
      input.date,
      minutesToClock(gap.startMinute),
    ).toISOString();
    const endsAt = parseHongKongDateTime(
      input.date,
      minutesToClock(gap.endMinute),
    ).toISOString();
    const { data: created, error: insertError } = await admin
      .from("lessons")
      .insert({
        lesson_type_id: input.lessonTypeId,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "assigned",
        coach_id: input.coachId,
        earned_amount_hkd: null,
        headcount: input.headcount,
        expected_headcount: input.expectedHeadcount,
        notes: input.notes,
        split_from_lesson_id: input.lessonId,
      })
      .select("id")
      .single();
    if (insertError || !created) {
      console.error("[keepUnregisteredAssignment] insert", {
        error: insertError,
        lessonId: input.lessonId,
      });
      return "餘下時段未能保留為待簽到";
    }
    if (studentIds.length > 0) {
      const { error: linkError } = await admin.from("lesson_students").insert(
        studentIds.map((studentId) => ({
          lesson_id: created.id,
          student_id: studentId,
        })),
      );
      if (linkError) {
        console.error("[keepUnregisteredAssignment] link", {
          error: linkError,
          lessonId: input.lessonId,
        });
        return "餘下時段未能保留為待簽到";
      }
    }
  }
  return null;
}

function sameStudentSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sortedLeft = left.map((name) => name.toLowerCase()).sort();
  const sortedRight = right.map((name) => name.toLowerCase()).sort();
  return sortedLeft.every((name, index) => name === sortedRight[index]);
}

function selectedStudentNames(formData: FormData): string[] {
  const raw = String(formData.get("student_names") ?? "").trim();
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return [
      ...new Set(parsed.map((value) => String(value).trim()).filter(Boolean)),
    ];
  } catch (error) {
    console.error("[selectedStudentNames]", { error });
    return [];
  }
}

async function ensureStudentIds(names: string[]): Promise<string[] | null> {
  const trimmed = names.map((name) => name.trim()).filter(Boolean);
  const uniqueNames = [...new Set(trimmed)];
  if (uniqueNames.length === 0) {
    return [];
  }
  const admin = createAdminClient();
  const lookedUp = await Promise.all(
    uniqueNames.map(async (name) => {
      const { data, error } = await admin
        .from("students")
        .select("id")
        .ilike("name", name)
        .limit(1);
      if (error) {
        console.error("[ensureStudentIds] lookup", { error, name });
        return { name, id: null as string | null, failed: true };
      }
      return { name, id: data?.[0]?.id ?? null, failed: false };
    }),
  );
  if (lookedUp.some((row) => row.failed)) {
    return null;
  }
  const idByLower = new Map<string, string>();
  for (const row of lookedUp) {
    if (row.id) {
      idByLower.set(row.name.toLowerCase(), row.id);
    }
  }
  const missing = uniqueNames.filter(
    (name) => !idByLower.has(name.toLowerCase()),
  );
  if (missing.length > 0) {
    const { data: inserted, error: insertError } = await admin
      .from("students")
      .insert(missing.map((name) => ({ name })))
      .select("id, name");
    if (insertError || !inserted || inserted.length !== missing.length) {
      console.error("[ensureStudentIds] insert", { error: insertError });
      return null;
    }
    for (const row of inserted) {
      idByLower.set(String(row.name).toLowerCase(), row.id);
    }
  }
  const ids = names.map((name) => idByLower.get(name.trim().toLowerCase()));
  if (ids.some((id) => !id)) {
    return null;
  }
  return ids as string[];
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

async function showFullDayEndToDatabase(
  lessonId: string,
  coachId: string,
  date: string,
  endMinute: number,
): Promise<ActionResult | null> {
  if (endMinute !== 1440) {
    return null;
  }
  const { error } = await createAdminClient()
    .from("lessons")
    .update({
      ends_at: parseHongKongDateTime(date, "23:59").toISOString(),
    })
    .eq("id", lessonId)
    .eq("coach_id", coachId);
  if (error) {
    console.error("[showFullDayEndToDatabase]", { error, lessonId });
    return { ok: false, error: "無法核對全日派更" };
  }
  return null;
}

async function restoreLessonEnd(
  lessonId: string,
  coachId: string,
  endsAt: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("lessons")
    .update({ ends_at: endsAt })
    .eq("id", lessonId)
    .eq("coach_id", coachId);
  if (error) {
    console.error("[restoreLessonEnd]", { error, lessonId });
  }
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
  if (
    message.includes("outside the assignment") ||
    message.includes("not part of this shift")
  ) {
    return "簽到時間需要覆蓋或緊貼原本派更";
  }
  if (message.includes("overlap")) {
    return "簽到時段不可重疊";
  }
  if (message.includes("invalid")) {
    return "簽到時段無效";
  }
  return "確認簽到失敗";
}

async function hourlyRateForJobType(
  supabase: SupabaseServerClient,
  coachId: string,
  lessonTypeId: string,
  profileHourly: number | string | null,
): Promise<number | { error: string }> {
  const { data, error } = await supabase
    .from("coach_rates")
    .select("amount_hkd")
    .eq("coach_id", coachId)
    .eq("lesson_type_id", lessonTypeId)
    .maybeSingle();
  if (error) {
    console.error("[hourlyRateForJobType]", { error, coachId, lessonTypeId });
    return { error: "讀取工作類型時薪失敗" };
  }
  if (data) {
    const amount = Number(data.amount_hkd);
    if (!Number.isFinite(amount) || amount < 0) {
      return { error: "此工作類型的時薪無效" };
    }
    return amount;
  }
  const fallback = Number(profileHourly);
  if (Number.isFinite(fallback) && fallback >= 0) {
    return fallback;
  }
  return { error: "尚未設定此工作類型的時薪" };
}

type CheckInStaffProfile = {
  staff_kind: string | null;
  hourly_rate_hkd: number | string | null;
  pay_ratio: number | string | null;
};

type CheckInLessonType = {
  id: string;
  pay_mode: PayMode;
  registers_student: boolean;
};

async function quoteCheckInPeriod(
  supabase: SupabaseServerClient,
  staffId: string,
  profile: CheckInStaffProfile,
  lessonType: CheckInLessonType,
  studentNames: string[],
  durationMinutes: number,
  slot: SlotWindow,
): Promise<
  | { earned: number | null; studentFee: number | null; studentIds: string[] }
  | { error: string }
> {
  if (lessonType.pay_mode === "per_head") {
    if (studentNames.length === 0) {
      return { error: "請選擇教了哪位學生" };
    }
    const ratio = Number(profile.pay_ratio);
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return { error: "尚未設定 Coach 分成比例" };
    }
    const [{ data, error }, ensured] = await Promise.all([
      supabase
        .from("coach_rates")
        .select("amount_hkd")
        .eq("coach_id", staffId)
        .eq("lesson_type_id", lessonType.id)
        .maybeSingle(),
      ensureStudentIds(studentNames),
    ]);
    if (error) {
      console.error("[quoteCheckInPeriod] per head", {
        error,
        staffId,
        lessonTypeId: lessonType.id,
      });
      return { error: "讀取 MIIT 每人薪資失敗" };
    }
    if (!ensured) {
      return { error: "找不到學生" };
    }
    const headRate = data == null ? Number.NaN : Number(data.amount_hkd);
    const quoted = await quoteMiitLessonPay({
      slot,
      studentNames,
      payRatio: ratio,
      headRateFallback: headRate,
    });
    if (!quoted.ok) {
      return { error: quoted.error };
    }
    return {
      earned: quoted.quote.earnedAmountHkd,
      studentFee: quoted.quote.studentFeeHkd,
      studentIds: ensured,
    };
  }

  const hourlyByType = lessonType.pay_mode === "per_hour";
  const skipsStudents =
    hourlyByType ||
    (lessonType.pay_mode !== "per_student" &&
      (profile.staff_kind === "operations" || lessonType.registers_student !== true));
  if (skipsStudents) {
    let hourly = Number(profile.hourly_rate_hkd);
    if (hourlyByType) {
      const typeRate = await hourlyRateForJobType(
        supabase,
        staffId,
        lessonType.id,
        profile.hourly_rate_hkd,
      );
      if (typeof typeRate === "object") {
        return typeRate;
      }
      hourly = typeRate;
    } else if (profile.staff_kind === "operations" && (!Number.isFinite(hourly) || hourly < 0)) {
      return { error: "尚未設定 Admin 時薪" };
    }
    const rate = Number.isFinite(hourly) && hourly >= 0 ? hourly : 0;
    return {
      earned: Math.round(rate * (durationMinutes / 60) * 100) / 100,
      studentFee: null,
      studentIds: [],
    };
  }

  if (studentNames.length === 0) {
    return { error: "請選擇教了哪位學生" };
  }
  const ratio = Number(profile.pay_ratio);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return { error: "尚未設定 Coach 分成比例" };
  }
  const [ensured, quoted] = await Promise.all([
    ensureStudentIds(studentNames),
    quotePtLessonPay({ studentNames, payRatio: ratio }),
  ]);
  if (!ensured) {
    return { error: "找不到學生" };
  }
  if (!quoted.ok) {
    return { error: quoted.error };
  }
  return {
    earned: quoted.quote.earnedAmountHkd,
    studentFee: quoted.quote.studentFeeHkd,
    studentIds: ensured,
  };
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
    const typedPeriods = [...parsed.periods]
      .map((period) => ({
        startMinute: period.startMinute,
        endMinute: period.endMinute,
        lessonTypeId: period.lessonTypeId || lessonTypeId,
        studentNames: period.studentNames ?? selectedStudentNames(formData),
      }))
      .sort((a, b) => a.startMinute - b.startMinute);
    const typeIds = [...new Set(typedPeriods.map((period) => period.lessonTypeId))];

    const supabase = await createClient();
    const lessonPromise = supabase
      .from("lessons")
      .select(
        "id, lesson_type_id, starts_at, ends_at, status, coach_id, headcount, expected_headcount, notes",
      )
      .eq("id", lessonId)
      .eq("coach_id", staffId)
      .maybeSingle();
    const typesPromise = Promise.all([
      supabase
        .from("staff_work_types")
        .select("lesson_type_id")
        .eq("coach_id", staffId)
        .in("lesson_type_id", typeIds),
      supabase
        .from("lesson_types")
        .select("id, name, registers_student, pay_mode")
        .in("id", typeIds)
        .eq("active", true),
    ]);
    const profilePromise = supabase
      .from("profiles")
      .select("staff_kind, hourly_rate_hkd, pay_ratio")
      .eq("id", staffId)
      .maybeSingle();

    const { data: lesson, error: lessonError } = await lessonPromise;
    if (lessonError) {
      console.error("[confirmLessonPeriodsAction] load", { error: lessonError });
      return { ok: false, error: "讀取派更失敗" };
    }
    if (!lesson || (lesson.status !== "assigned" && lesson.status !== "completed")) {
      return { ok: false, error: "僅已派更或已簽到的時段可以確認或修改簽到" };
    }

    const window = lessonMinutesInHongKong(lesson.starts_at, lesson.ends_at);
    const availabilityPromise =
      lesson.status === "completed"
        ? supabase
            .from("staff_availabilities")
            .select("start_minute, end_minute")
            .eq("coach_id", staffId)
            .eq("available_date", window.date)
            .eq("released", false)
            .lte("start_minute", window.startMinute)
            .gte("end_minute", window.endMinute)
            .order("start_minute", { ascending: true })
            .limit(1)
        : Promise.resolve({ data: null as { start_minute: number; end_minute: number }[] | null, error: null });

    const [
      [{ data: allowedTypes, error: allowedError }, { data: activeTypes, error: typeError }],
      { data: staffProfile, error: staffError },
      { data: covers, error: coverError },
    ] = await Promise.all([typesPromise, profilePromise, availabilityPromise]);

    if (allowedError || typeError) {
      console.error("[confirmLessonPeriodsAction] work type", {
        error: allowedError ?? typeError,
        lessonId,
      });
      return { ok: false, error: "讀取工作類型失敗" };
    }
    const allowedIds = new Set((allowedTypes ?? []).map((type) => type.lesson_type_id));
    const typeById = new Map(
      (activeTypes ?? []).map((type) => [
        type.id,
        {
          id: type.id,
          pay_mode: type.pay_mode as PayMode,
          registers_student: type.registers_student === true,
        },
      ]),
    );
    if (typeIds.some((typeId) => !allowedIds.has(typeId) || !typeById.has(typeId))) {
      return {
        ok: false,
        error:
          actor === "employer"
            ? "此工作類型未分配給這位同事"
            : "此工作類型未分配給你",
      };
    }
    const activeType = typeById.get(typedPeriods[0].lessonTypeId);
    if (!activeType) {
      return { ok: false, error: "請選擇實際工作類型" };
    }

    let windowStart = window.startMinute;
    let windowEnd = window.endMinute;
    if (lesson.status === "completed") {
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

    if (staffError || !staffProfile) {
      console.error("[confirmLessonPeriodsAction] profile", { error: staffError });
      return { ok: false, error: "讀取薪資設定失敗" };
    }

    const firstStudents = typedPeriods[0]?.studentNames ?? [];
    const studentsDiffer =
      typedPeriods.length > 1 &&
      typedPeriods.some(
        (period) => !sameStudentSet(period.studentNames, firstStudents),
      );
    const pricedPerHead = typedPeriods.some(
      (period) => typeById.get(period.lessonTypeId)?.pay_mode === "per_head",
    );
    const pricedPerStudent = typedPeriods.some(
      (period) => typeById.get(period.lessonTypeId)?.pay_mode === "per_student",
    );
    // Same job type still has to be saved per lesson when the students differ.
    // The single check-in call copies one student list onto every split.
    if (typeIds.length > 1 || studentsDiffer || pricedPerHead) {
      const allStudentNames = [
        ...new Set(typedPeriods.flatMap((period) => period.studentNames)),
      ];
      if (allStudentNames.length > 0) {
        const warmed = await ensureStudentIds(allStudentNames);
        if (!warmed) {
          return { ok: false, error: "找不到學生" };
        }
        if (pricedPerStudent) {
          await lookupAirtableTuitions(allStudentNames);
        }
      }
      const quoteResults = await Promise.all(
        typedPeriods.map(async (period) => {
          const lessonType = typeById.get(period.lessonTypeId);
          if (!lessonType) {
            return { error: "請選擇實際工作類型" as const };
          }
          const startsAt = parseHongKongDateTime(
            window.date,
            minutesToClock(period.startMinute),
          );
          const endsAt = parseHongKongDateTime(
            window.date,
            minutesToClock(period.endMinute),
          );
          if (endsAt > now) {
            return { error: "只可簽到已經結束的時段" as const };
          }
          const durationMinutes =
            (endsAt.getTime() - startsAt.getTime()) / 60_000;
          const quote = await quoteCheckInPeriod(
            supabase,
            staffId,
            staffProfile,
            lessonType,
            period.studentNames,
            durationMinutes,
            {
              date: window.date,
              startMinute: period.startMinute,
              endMinute: period.endMinute,
            },
          );
          if ("error" in quote) {
            return { error: quote.error };
          }
          return {
            startMinute: period.startMinute,
            endMinute: period.endMinute,
            lessonTypeId: period.lessonTypeId,
            earned: quote.earned,
            studentFee: quote.studentFee,
            studentIds: quote.studentIds,
          };
        }),
      );
      const failedQuote = quoteResults.find(
        (row): row is { error: string } => "error" in row,
      );
      if (failedQuote) {
        return { ok: false, error: failedQuote.error };
      }
      const prepared = quoteResults as {
        startMinute: number;
        endMinute: number;
        lessonTypeId: string;
        earned: number | null;
        studentFee: number | null;
        studentIds: string[];
      }[];

      const first = prepared[0];
      const fullDayEnd = await showFullDayEndToDatabase(
        lessonId,
        staffId,
        window.date,
        window.endMinute,
      );
      if (fullDayEnd) {
        return fullDayEnd;
      }
      const { error: firstError } = await supabase.rpc("confirm_staff_lesson_periods", {
        p_id: lessonId,
        p_periods: [
          {
            start_minute: first.startMinute,
            end_minute: first.endMinute,
            earned_amount_hkd: first.earned,
          },
        ],
        p_lesson_type_id: first.lessonTypeId,
      });
      if (firstError) {
        if (window.endMinute === 1440) {
          await restoreLessonEnd(lessonId, staffId, lesson.ends_at);
        }
        console.error("[confirmLessonPeriodsAction] mixed first", { error: firstError, lessonId });
        return { ok: false, error: confirmLessonErrorMessage(firstError.message) };
      }
      const linked = await linkLessonStudents(lessonId, first.studentIds);
      if (!linked.ok) {
        return linked;
      }
      const admin = createAdminClient();
      const { error: feeError } = await admin
        .from("lessons")
        .update({ student_fee_hkd: first.studentFee })
        .eq("id", lessonId)
        .eq("coach_id", staffId);
      if (feeError) {
        console.error("[confirmLessonPeriodsAction] mixed fee", { error: feeError, lessonId });
      }

      for (const period of prepared.slice(1)) {
        const startsAt = parseHongKongDateTime(
          window.date,
          minutesToClock(period.startMinute),
        ).toISOString();
        const endsAt = parseHongKongDateTime(
          window.date,
          minutesToClock(period.endMinute),
        ).toISOString();
        const { data: created, error: insertError } = await admin
          .from("lessons")
          .insert({
            lesson_type_id: period.lessonTypeId,
            starts_at: startsAt,
            ends_at: endsAt,
            status: "completed",
            coach_id: staffId,
            earned_amount_hkd: period.earned,
            student_fee_hkd: period.studentFee,
            headcount: lesson.headcount,
            expected_headcount: lesson.expected_headcount,
            notes: lesson.notes,
            split_from_lesson_id: lessonId,
          })
          .select("id")
          .single();
        if (insertError || !created) {
          console.error("[confirmLessonPeriodsAction] mixed insert", {
            error: insertError,
            lessonId,
          });
          return { ok: false, error: "其餘時段未能簽到" };
        }
        const linkedExtra = await linkLessonStudents(created.id, period.studentIds);
        if (!linkedExtra.ok) {
          return linkedExtra;
        }
      }

      if (lesson.status === "assigned") {
        const remainderError = await keepUnregisteredAssignment({
          lessonId,
          coachId: staffId,
          date: window.date,
          assignStart: window.startMinute,
          assignEnd: window.endMinute,
          periods: prepared,
          lessonTypeId: lesson.lesson_type_id,
          headcount: lesson.headcount,
          expectedHeadcount: lesson.expected_headcount,
          notes: lesson.notes,
        });
        if (remainderError) {
          return { ok: false, error: remainderError };
        }
      }

      revalidateSchedules();
      return { ok: true, data: undefined };
    }

    const payMode = activeType.pay_mode as PayMode;
    const hourlyByType = payMode === "per_hour";
    const isAdmin =
      !hourlyByType &&
      payMode !== "per_student" &&
      (staffProfile.staff_kind === "operations" ||
        activeType.registers_student !== true);
    const studentNames =
      typedPeriods[0].studentNames.length > 0
        ? typedPeriods[0].studentNames
        : selectedStudentNames(formData);
    let studentIds = selectedStudentIds(formData);
    let sessionAmount: number | null = null;
    let tuition: number | null = null;
    if (hourlyByType || isAdmin) {
      let hourly = Number(staffProfile.hourly_rate_hkd);
      if (hourlyByType) {
        const typeRate = await hourlyRateForJobType(
          supabase,
          staffId,
          activeType.id,
          staffProfile.hourly_rate_hkd,
        );
        if (typeof typeRate === "object") {
          return { ok: false, error: typeRate.error };
        }
        hourly = typeRate;
      } else if (
        staffProfile.staff_kind === "operations" &&
        (!Number.isFinite(hourly) || hourly < 0)
      ) {
        return { ok: false, error: "尚未設定 Admin 時薪" };
      }
      sessionAmount = Number.isFinite(hourly) && hourly >= 0 ? hourly : 0;
    } else {
      const names = studentNames.length > 0 ? studentNames : [];
      if (names.length === 0 && studentIds.length === 0) {
        return { ok: false, error: "請選擇教了哪位學生" };
      }
      const ratio = Number(staffProfile.pay_ratio);
      if (!Number.isFinite(ratio) || ratio <= 0) {
        return { ok: false, error: "尚未設定 Coach 分成比例" };
      }
      let quoteNames: string[] = names;
      if (names.length > 0) {
        const ensured = await ensureStudentIds(names);
        if (!ensured) {
          return { ok: false, error: "找不到學生" };
        }
        studentIds = ensured;
      } else {
        const { data: studentRows, error: studentError } = await supabase
          .from("students")
          .select("id, name")
          .in("id", studentIds);
        if (studentError || (studentRows ?? []).length !== studentIds.length) {
          return { ok: false, error: "找不到學生" };
        }
        quoteNames = (studentRows ?? []).map((student) => student.name);
      }
      const quoted = await quotePtLessonPay({
        studentNames: quoteNames,
        payRatio: ratio,
      });
      if (!quoted.ok) {
        return { ok: false, error: quoted.error };
      }
      tuition = quoted.quote.studentFeeHkd;
      sessionAmount = quoted.quote.earnedAmountHkd ?? 0;
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
      const amount = hourlyByType || isAdmin
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

    const fullDayEnd = await showFullDayEndToDatabase(
      lessonId,
      staffId,
      window.date,
      window.endMinute,
    );
    if (fullDayEnd) {
      return fullDayEnd;
    }
    const { error } = await supabase.rpc("confirm_staff_lesson_periods", {
      p_id: lessonId,
      p_periods: periodsWithPay,
      p_lesson_type_id: activeType.id,
    });

    if (error) {
      if (window.endMinute === 1440) {
        await restoreLessonEnd(lessonId, staffId, lesson.ends_at);
      }
      console.error("[confirmLessonPeriodsAction]", { error, lessonId });
      return { ok: false, error: confirmLessonErrorMessage(error.message) };
    }

    if (hourlyByType || isAdmin) {
      const cleared = await linkLessonStudents(lessonId, []);
      if (!cleared.ok) {
        return cleared;
      }
      const admin = createAdminClient();
      const { data: splits, error: splitError } = await admin
        .from("lessons")
        .select("id")
        .eq("coach_id", staffId)
        .eq("split_from_lesson_id", lessonId)
        .eq("lesson_type_id", activeType.id);
      if (splitError) {
        console.error("[confirmLessonPeriodsAction] clear split students", {
          error: splitError,
          lessonId,
        });
      }
      const splitIds = (splits ?? []).map((row) => row.id);
      if (splitIds.length > 0) {
        const { error: splitStudentError } = await admin
          .from("lesson_students")
          .delete()
          .in("lesson_id", splitIds);
        if (splitStudentError) {
          console.error("[confirmLessonPeriodsAction] clear split students", {
            error: splitStudentError,
            lessonId,
          });
        }
      }
      const { error: feeError } = await admin
        .from("lessons")
        .update({ student_fee_hkd: null })
        .in("id", [lessonId, ...splitIds])
        .eq("coach_id", staffId);
      if (feeError) {
        console.error("[confirmLessonPeriodsAction] clear student fee", {
          error: feeError,
          lessonId,
        });
      }
    } else if (tuition != null) {
      const { error: feeError } = await createAdminClient()
        .from("lessons")
        .update({ student_fee_hkd: tuition })
        .eq("id", lessonId)
        .eq("coach_id", staffId);
      if (feeError) {
        console.error("[confirmLessonPeriodsAction] student fee", { error: feeError, lessonId });
      }
    }

    if (lesson.status === "assigned") {
      const remainderError = await keepUnregisteredAssignment({
        lessonId,
        coachId: staffId,
        date: window.date,
        assignStart: window.startMinute,
        assignEnd: window.endMinute,
        periods: sortedPeriods,
        lessonTypeId: lesson.lesson_type_id,
        headcount: lesson.headcount,
        expectedHeadcount: lesson.expected_headcount,
        notes: lesson.notes,
      });
      if (remainderError) {
        return { ok: false, error: remainderError };
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

    revalidateCalendar();
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

    // Fee edits land on salary + coach detail; skip full schedule fan-out.
    revalidatePay();
    revalidatePath("/employer/coaches");
    revalidatePath("/employer/lessons");
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[updateLessonFeesAction] unexpected", { error });
    return { ok: false, error: "更新金額時發生錯誤" };
  }
}

export async function undoCheckInAction(lessonId: string): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    if (profile.role !== "coach" && profile.role !== "employer") {
      return { ok: false, error: "沒有權限撤銷簽到" };
    }
    if (!lessonId) {
      return { ok: false, error: "找不到簽到紀錄" };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("undo_staff_check_in", {
      p_id: lessonId,
    });
    if (error) {
      console.error("[undoCheckInAction]", { error, lessonId });
      if (error.message.includes("not found")) {
        return { ok: false, error: "找不到簽到紀錄" };
      }
      if (error.message.includes("completed check-in")) {
        return { ok: false, error: "只有已簽到的時段可以撤銷" };
      }
      return { ok: false, error: "撤銷簽到失敗" };
    }

    revalidateSchedules();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[undoCheckInAction] unexpected", { error });
    return { ok: false, error: "撤銷簽到時發生錯誤" };
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

    if (lesson.status === "completed") {
      revalidateSchedules();
    } else {
      revalidateCalendar();
    }
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[cancelLessonAction] unexpected", { error });
    return { ok: false, error: "取消課堂時發生錯誤" };
  }
}
