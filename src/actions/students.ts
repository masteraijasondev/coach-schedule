"use server";

import { requireEmployer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function createStudentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireEmployer();
    const name = String(formData.get("name") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim() || null;

    if (!name) {
      return { ok: false, error: "請輸入學生姓名" };
    }

    const supabase = await createClient();
    const { error } = await supabase.from("students").insert({ name, notes });

    if (error) {
      console.error("[createStudentAction]", { error });
      return { ok: false, error: "新增學生失敗" };
    }

    revalidatePath("/employer/students");
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[createStudentAction] unexpected", { error });
    return { ok: false, error: "新增學生時發生錯誤" };
  }
}

export async function listActiveStudentsAction(): Promise<
  ActionResult<{ id: string; name: string }[]>
> {
  try {
    await requireEmployer();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("students")
      .select("id, name")
      .eq("active", true)
      .order("name");

    if (error) {
      console.error("[listActiveStudentsAction]", { error });
      return { ok: false, error: "無法載入學生" };
    }

    return { ok: true, data: data ?? [] };
  } catch (error) {
    console.error("[listActiveStudentsAction] unexpected", { error });
    return { ok: false, error: "無法載入學生" };
  }
}

export async function toggleStudentActiveAction(
  studentId: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    await requireEmployer();
    const supabase = await createClient();
    const { error } = await supabase
      .from("students")
      .update({ active })
      .eq("id", studentId);

    if (error) {
      return { ok: false, error: "更新學生狀態失敗" };
    }

    revalidatePath("/employer/students");
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[toggleStudentActiveAction] unexpected", { error });
    return { ok: false, error: "更新學生時發生錯誤" };
  }
}
