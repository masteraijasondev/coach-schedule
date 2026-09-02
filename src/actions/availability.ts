"use server";

import { requireCoach } from "@/lib/auth";
import {
  availabilityWeekStarts,
  hongKongToday,
} from "@/lib/calendar";
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

  const weekStarts = availabilityWeekStarts();
  const [firstWeek] = weekStarts;
  const lastAllowedDate = new Date(`${weekStarts[3]}T00:00:00Z`);
  lastAllowedDate.setUTCDate(lastAllowedDate.getUTCDate() + 6);
  const lastDate = lastAllowedDate.toISOString().slice(0, 10);
  if (date < hongKongToday() || date < firstWeek || date > lastDate) {
    return "只可提交本週起計四星期內的可返工時間";
  }

  const startHour = String(Math.floor(startMinute / 60)).padStart(2, "0");
  const startMins = String(startMinute % 60).padStart(2, "0");
  const startsAt = fromZonedTime(
    `${date}T${startHour}:${startMins}:00`,
    TIMEZONE,
  );
  if (startsAt <= new Date()) {
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
  if (message.includes("four-week window")) {
    return "只可提交本週起計四星期內的可返工或放假";
  }
  if (message.includes("not found")) {
    return "找不到此時段，請重新整理後再試";
  }
  if (message.includes("leave day")) {
    return "當日已報放假，請先取消放假再報可返工";
  }
  return "儲存可返工時間失敗";
}

function validateLeaveDate(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return "日期無效";
  }
  const weekStarts = availabilityWeekStarts();
  const [firstWeek] = weekStarts;
  const lastAllowedDate = new Date(`${weekStarts[3]}T00:00:00Z`);
  lastAllowedDate.setUTCDate(lastAllowedDate.getUTCDate() + 6);
  const lastDate = lastAllowedDate.toISOString().slice(0, 10);
  if (date < hongKongToday() || date < firstWeek || date > lastDate) {
    return "只可提交本週起計四星期內的放假";
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
    return { ok: false, error: "報放假時發生錯誤" };
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
