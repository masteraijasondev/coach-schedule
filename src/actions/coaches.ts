"use server";

import { requireEmployer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function createCoachAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireEmployer();

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const tempPassword = String(formData.get("temp_password") ?? "");

    if (!email || !fullName || tempPassword.length < 8) {
      return { ok: false, error: "請填寫姓名、電郵，臨時密碼至少 8 字元" };
    }

    const admin = createAdminClient();
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });

    if (createError || !created.user) {
      console.error("[createCoachAction] createUser", { error: createError });
      return { ok: false, error: createError?.message ?? "建立帳號失敗" };
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      email,
      full_name: fullName,
      role: "coach",
      must_change_password: true,
    });

    if (profileError) {
      console.error("[createCoachAction] profile", { error: profileError });
      await admin.auth.admin.deleteUser(created.user.id);
      return { ok: false, error: "建立教練資料失敗" };
    }

    revalidatePath("/employer/coaches");
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[createCoachAction] unexpected", { error });
    return { ok: false, error: "建立教練時發生錯誤" };
  }
}
