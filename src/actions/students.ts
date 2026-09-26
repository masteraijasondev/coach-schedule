"use server";

import {
  createAirtableStudent,
  lookupAirtableExpectedStudents,
  searchAirtableStudents,
} from "@/lib/airtable-tuition";
import { requireEmployer, requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
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

export async function createCheckInStudentAction(
  name: string,
): Promise<ActionResult<{ id: string; name: string; airtableSaved: boolean }>> {
  try {
    const profile = await requireProfile();
    if (profile.role !== "coach" && profile.role !== "employer") {
      return { ok: false, error: "沒有權限新增學生" };
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return { ok: false, error: "請輸入學生姓名" };
    }
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("students")
      .insert({ name: trimmed })
      .select("id, name")
      .single();
    if (error || !data) {
      console.error("[createCheckInStudentAction]", { error });
      return { ok: false, error: "新增學生失敗" };
    }
    const airtable = await createAirtableStudent(trimmed);
    revalidatePath("/employer/students");
    revalidatePath("/coach");
    return {
      ok: true,
      data: { id: data.id, name: data.name, airtableSaved: airtable.ok },
    };
  } catch (error) {
    console.error("[createCheckInStudentAction] unexpected", { error });
    return { ok: false, error: "新增學生時發生錯誤" };
  }
}

export async function searchAirtableStudentsAction(
  query: string,
): Promise<ActionResult<string[]>> {
  try {
    const profile = await requireProfile();
    if (profile.role !== "coach" && profile.role !== "employer") {
      return { ok: false, error: "沒有權限讀取學生" };
    }
    const result = await searchAirtableStudents(query);
    if (result.error) {
      return { ok: false, error: result.error };
    }
    return { ok: true, data: result.names };
  } catch (error) {
    console.error("[searchAirtableStudentsAction]", { error });
    return { ok: false, error: "無法搜尋 Airtable 學生" };
  }
}

export async function lookupSessionStudentsAction(input: {
  date: string;
  startMinute: number;
  endMinute: number;
  workTypeName: string;
}): Promise<ActionResult<string[]>> {
  try {
    const profile = await requireProfile();
    if (profile.role !== "coach" && profile.role !== "employer") {
      return { ok: false, error: "沒有權限讀取學生" };
    }
    const result = await lookupAirtableExpectedStudents(input);
    if (result.error && result.names.length === 0) {
      return { ok: false, error: result.error };
    }
    return { ok: true, data: result.names };
  } catch (error) {
    console.error("[lookupSessionStudentsAction]", { error });
    return { ok: false, error: "無法讀取 Airtable 預約學生" };
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
