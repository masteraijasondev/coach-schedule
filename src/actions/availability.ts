"use server";

import { requireCoach, requireEmployer } from "@/lib/auth";
import { hongKongToday } from "@/lib/calendar";
import { TIMEZONE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { fromZonedTime } from "date-fns-tz";
import { revalidatePath } from "next/cache";

const MINUTES_PER_DAY = 1440;
const TIME_STEP_MINUTES = 30;

function revalidateAvailabilityPages() {
  revalidatePath("/coach");
  revalidatePath("/employer");
  revalidatePath("/coach/shift");
  revalidatePath("/employer/availability");
}

function parseMinute(raw: FormDataEntryValue | null): number | null {
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function validateAvailabilityInput(
  date: string,
  startMinute: number | null,
  endMinute: number | null,
  options?: { allowStarted?: boolean },
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return "日期無效";
  }
  if (
    startMinute == null ||
    endMinute == null ||
    startMinute < 0 ||
    startMinute >= MINUTES_PER_DAY ||
    endMinute <= 0 ||
    endMinute > MINUTES_PER_DAY ||
    startMinute % TIME_STEP_MINUTES !== 0 ||
    endMinute % TIME_STEP_MINUTES !== 0 ||
    endMinute <= startMinute
  ) {
    return "請選擇有效的開始及結束時間";
  }

  if (date < hongKongToday()) {
    return "只可提交今天或未來的可返工時間";
  }

  const startHour = String(Math.floor(startMinute / 60)).padStart(2, "0");
  const startMins = String(startMinute % 60).padStart(2, "0");
  const startsAt = fromZonedTime(
    `${date}T${startHour}:${startMins}:00`,
    TIMEZONE,
  );
  if (!options?.allowStarted && startsAt <= new Date()) {
    return "只可新增或修改尚未開始的時段";
  }

  return null;
}

function availabilityDatabaseError(message: string): string {
  if (
    message.includes("already started") ||
    message.includes("Started availability")
  ) {
    return "只可新增或修改尚未開始的時段";
  }
  if (message.includes("in the past")) {
    return "只可提交今天或未來的可返工或放假";
  }
  if (message.includes("not found")) {
    return "找不到此時段，請重新整理後再試";
  }
  if (message.includes("leave day")) {
    return "此時段已申報放假或 Short Break";
  }
  if (message.includes("locked by an assigned lesson")) {
    return "此時段已有派更，不可修改或刪除可返工時間";
  }
  if (message.includes("Released availability")) {
    return "暫無需要的時段不可由員工修改；如需再報可返工，請新增時段";
  }
  if (message.includes("Cannot release a window with assigned work")) {
    return "此時段已有派更，請只釋放剩餘可返工時間";
  }
  if (message.includes("Completed work cannot be changed to sick leave")) {
    return "已簽到的時段不能改為病假";
  }
  if (message.includes("assigned work")) {
    return "此時段已有派更，不可申報放假";
  }
  if (message.includes("outside availability")) {
    return "只能釋放已申報的可返工時間";
  }
  if (message.includes("Only employers")) {
    return "只有僱主可以將時段標為暫無需要";
  }
  return "儲存可返工時間失敗";
}

function validateLeaveDate(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return "日期無效";
  }
  if (date < hongKongToday()) {
    return "只可提交今天或未來的放假";
  }
  return null;
}

export async function saveLeaveAction(
  leaveDate: string,
): Promise<ActionResult> {
  try {
    await requireCoach();
    const validationError = validateLeaveDate(leaveDate);
    if (validationError) {
      return { ok: false, error: validationError };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("set_staff_leave", {
      p_leave_date: leaveDate,
    });

    if (error) {
      console.error("[saveLeaveAction]", { error, leaveDate });
      return { ok: false, error: availabilityDatabaseError(error.message) };
    }

    revalidateAvailabilityPages();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[saveLeaveAction] unexpected", { error });
    return { ok: false, error: "申報放假時發生錯誤" };
  }
}

export async function saveSickLeaveAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCoach();
    const date = String(formData.get("leave_date") ?? "").trim();
    const fullDay = String(formData.get("full_day") ?? "") === "1";
    const startMinute = fullDay ? null : parseMinute(formData.get("start_minute"));
    const endMinute = fullDay ? null : parseMinute(formData.get("end_minute"));
    const validationError = fullDay
      ? validateLeaveDate(date)
      : validateAvailabilityInput(date, startMinute, endMinute, {
          allowStarted: true,
        });
    if (validationError) {
      return { ok: false, error: validationError.replace("放假", "病假") };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("save_staff_sick_leave", {
      p_leave_date: date,
      p_start_minute: startMinute,
      p_end_minute: endMinute,
    });

    if (error) {
      console.error("[saveSickLeaveAction]", { error, date });
      return { ok: false, error: availabilityDatabaseError(error.message) };
    }

    revalidateAvailabilityPages();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[saveSickLeaveAction] unexpected", { error });
    return { ok: false, error: "請病假時發生錯誤" };
  }
}

export async function saveShortBreakAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCoach();
    const id = String(formData.get("leave_id") ?? "").trim() || null;
    const date = String(formData.get("leave_date") ?? "").trim();
    const startMinute = parseMinute(formData.get("start_minute"));
    const endMinute = parseMinute(formData.get("end_minute"));
    const validationError = validateAvailabilityInput(
      date,
      startMinute,
      endMinute,
    );
    if (validationError) {
      return { ok: false, error: validationError };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("save_staff_short_break", {
      p_id: id,
      p_leave_date: date,
      p_start_minute: startMinute,
      p_end_minute: endMinute,
    });

    if (error) {
      console.error("[saveShortBreakAction]", { error, leaveId: id, date });
      return { ok: false, error: availabilityDatabaseError(error.message) };
    }

    revalidateAvailabilityPages();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[saveShortBreakAction] unexpected", { error });
    return { ok: false, error: "報 Short Break 時發生錯誤" };
  }
}

export async function cancelLeaveAction(
  leaveDate: string,
): Promise<ActionResult> {
  try {
    await requireCoach();
    if (!leaveDate) {
      return { ok: false, error: "找不到放假紀錄" };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_staff_leave", {
      p_leave_date: leaveDate,
    });

    if (error) {
      console.error("[cancelLeaveAction]", { error, leaveDate });
      if (error.message.includes("Past leave")) {
        return { ok: false, error: "過去的放假不能取消" };
      }
      if (error.message.includes("not found")) {
        return { ok: false, error: "找不到放假紀錄" };
      }
      return { ok: false, error: availabilityDatabaseError(error.message) };
    }

    revalidateAvailabilityPages();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[cancelLeaveAction] unexpected", { error });
    return { ok: false, error: "取消放假時發生錯誤" };
  }
}

export async function cancelLeaveByIdAction(
  leaveId: string,
): Promise<ActionResult> {
  try {
    await requireCoach();
    if (!leaveId) {
      return { ok: false, error: "找不到放假紀錄" };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_staff_leave_by_id", {
      p_id: leaveId,
    });

    if (error) {
      console.error("[cancelLeaveByIdAction]", { error, leaveId });
      if (error.message.includes("Past leave")) {
        return { ok: false, error: "過去的放假不能取消" };
      }
      if (error.message.includes("not found")) {
        return { ok: false, error: "找不到放假紀錄" };
      }
      return { ok: false, error: availabilityDatabaseError(error.message) };
    }

    revalidateAvailabilityPages();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[cancelLeaveByIdAction] unexpected", { error });
    return { ok: false, error: "取消放假時發生錯誤" };
  }
}

export async function saveAvailabilityAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireCoach();
    const id = String(formData.get("availability_id") ?? "").trim() || null;
    const date = String(formData.get("available_date") ?? "").trim();
    const startMinute = parseMinute(formData.get("start_minute"));
    const endMinute = parseMinute(formData.get("end_minute"));
    const validationError = validateAvailabilityInput(
      date,
      startMinute,
      endMinute,
    );
    if (validationError) {
      return { ok: false, error: validationError };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("save_staff_availability", {
      p_id: id,
      p_available_date: date,
      p_start_minute: startMinute,
      p_end_minute: endMinute,
    });

    if (error) {
      console.error("[saveAvailabilityAction]", {
        error,
        availabilityId: id,
        date,
      });
      return {
        ok: false,
        error: availabilityDatabaseError(error.message),
      };
    }

    revalidateAvailabilityPages();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[saveAvailabilityAction] unexpected", { error });
    return { ok: false, error: "儲存可返工時間時發生錯誤" };
  }
}

export async function deleteAvailabilityAction(
  availabilityId: string,
): Promise<ActionResult> {
  try {
    await requireCoach();
    if (!availabilityId) {
      return { ok: false, error: "找不到此時段" };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_staff_availability", {
      p_id: availabilityId,
    });

    if (error) {
      console.error("[deleteAvailabilityAction]", {
        error,
        availabilityId,
      });
      if (error.message.includes("cannot be deleted")) {
        return { ok: false, error: "已開始的時段不可刪除" };
      }
      return {
        ok: false,
        error: availabilityDatabaseError(error.message),
      };
    }

    revalidateAvailabilityPages();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[deleteAvailabilityAction] unexpected", { error });
    return { ok: false, error: "刪除可返工時間時發生錯誤" };
  }
}

export async function releaseAvailabilityAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireEmployer();
    const coachId = String(formData.get("coach_id") ?? "").trim();
    const date = String(formData.get("date") ?? "").trim();
    const startMinute = parseMinute(formData.get("start_minute"));
    const endMinute = parseMinute(formData.get("end_minute"));
    if (!coachId) {
      return { ok: false, error: "請選擇員工" };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, error: "日期無效" };
    }
    if (
      startMinute == null ||
      endMinute == null ||
      startMinute < 0 ||
      startMinute >= MINUTES_PER_DAY ||
      endMinute <= 0 ||
      endMinute > MINUTES_PER_DAY ||
      startMinute % TIME_STEP_MINUTES !== 0 ||
      endMinute % TIME_STEP_MINUTES !== 0 ||
      endMinute <= startMinute
    ) {
      return { ok: false, error: "請選擇有效的開始及結束時間" };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("release_staff_availability", {
      p_coach_id: coachId,
      p_date: date,
      p_start_minute: startMinute,
      p_end_minute: endMinute,
    });

    if (error) {
      console.error("[releaseAvailabilityAction]", {
        error,
        coachId,
        date,
      });
      return { ok: false, error: availabilityDatabaseError(error.message) };
    }

    revalidateAvailabilityPages();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[releaseAvailabilityAction] unexpected", { error });
    return { ok: false, error: "標示暫無需要時發生錯誤" };
  }
}

export async function restoreReleasedAvailabilityAction(
  availabilityId: string,
): Promise<ActionResult> {
  try {
    await requireEmployer();
    if (!availabilityId) {
      return { ok: false, error: "找不到此時段" };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("restore_released_availability", {
      p_id: availabilityId,
    });

    if (error) {
      console.error("[restoreReleasedAvailabilityAction]", {
        error,
        availabilityId,
      });
      return { ok: false, error: availabilityDatabaseError(error.message) };
    }

    revalidateAvailabilityPages();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[restoreReleasedAvailabilityAction] unexpected", { error });
    return { ok: false, error: "恢復待派更時發生錯誤" };
  }
}
