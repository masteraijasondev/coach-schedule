"use server";

import { requireCoach } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { revalidatePath } from "next/cache";

function revalidateShiftPages() {
  revalidatePath("/coach/shift");
}

export async function clockInAction(): Promise<ActionResult> {
  try {
    const coach = await requireCoach();
    const supabase = await createClient();

    const { data: openShift, error: openError } = await supabase
      .from("shifts")
      .select("id")
      .eq("coach_id", coach.id)
      .is("clocked_out_at", null)
      .maybeSingle();

    if (openError) {
      console.error("[clockInAction] check open", { error: openError });
      return { ok: false, error: "無法檢查報更狀態" };
    }
    if (openShift) {
      return { ok: false, error: "你已報到，請先下班再重新報到" };
    }

    const { error } = await supabase.from("shifts").insert({
      coach_id: coach.id,
      clocked_in_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[clockInAction] insert", { error });
      if (error.code === "23505") {
        return { ok: false, error: "你已報到，請先下班再重新報到" };
      }
      return { ok: false, error: "報到失敗" };
    }

    revalidateShiftPages();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[clockInAction] unexpected", { error });
    return { ok: false, error: "報到時發生錯誤" };
  }
}

export async function clockOutAction(): Promise<ActionResult> {
  try {
    const coach = await requireCoach();
    const supabase = await createClient();

    const { data: openShift, error: openError } = await supabase
      .from("shifts")
      .select("id")
      .eq("coach_id", coach.id)
      .is("clocked_out_at", null)
      .maybeSingle();

    if (openError) {
      console.error("[clockOutAction] check open", { error: openError });
      return { ok: false, error: "無法檢查報更狀態" };
    }
    if (!openShift) {
      return { ok: false, error: "尚未報到，無法下班" };
    }

    const { error } = await supabase
      .from("shifts")
      .update({ clocked_out_at: new Date().toISOString() })
      .eq("id", openShift.id)
      .eq("coach_id", coach.id)
      .is("clocked_out_at", null);

    if (error) {
      console.error("[clockOutAction] update", { error });
      return { ok: false, error: "下班失敗" };
    }

    revalidateShiftPages();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[clockOutAction] unexpected", { error });
    return { ok: false, error: "下班時發生錯誤" };
  }
}
