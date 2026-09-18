"use server";

import { requireEmployer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
    const staffKind =
      String(formData.get("staff_kind") ?? "") === "operations"
        ? "operations"
        : "coach";

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
      staff_kind: staffKind,
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

export async function updateCoachNameAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireEmployer();

    const coachId = String(formData.get("coach_id") ?? "").trim();
    const fullName = String(formData.get("full_name") ?? "").trim();
    const staffKind =
      String(formData.get("staff_kind") ?? "") === "operations"
        ? "operations"
        : "coach";

    if (!coachId || !fullName) {
      return { ok: false, error: "請輸入教練姓名" };
    }

    const coach = await findCoachAccount(coachId);
    if (!coach) {
      return { ok: false, error: "找不到教練帳號" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, staff_kind: staffKind })
      .eq("id", coachId)
      .eq("role", "coach");

    if (error) {
      console.error("[updateCoachNameAction]", { error });
      return { ok: false, error: "更新姓名失敗" };
    }

    revalidateCoachPages();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[updateCoachNameAction] unexpected", { error });
    return { ok: false, error: "更新姓名時發生錯誤" };
  }
}

export async function resetCoachPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireEmployer();

    const coachId = String(formData.get("coach_id") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const mustChange = String(formData.get("must_change_password") ?? "") === "yes";

    if (!coachId || password.length < 8) {
      return { ok: false, error: "請輸入至少 8 字元的新密碼" };
    }

    const coach = await findCoachAccount(coachId);
    if (!coach) {
      return { ok: false, error: "找不到教練帳號" };
    }

    const admin = createAdminClient();
    const { error: passwordError } = await admin.auth.admin.updateUserById(
      coachId,
      { password },
    );

    if (passwordError) {
      console.error("[resetCoachPasswordAction] password", { passwordError });
      return { ok: false, error: passwordError.message ?? "重設密碼失敗" };
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({ must_change_password: mustChange })
      .eq("id", coachId)
      .eq("role", "coach");

    if (profileError) {
      console.error("[resetCoachPasswordAction] profile", { profileError });
      return { ok: false, error: "密碼已更新，但未能設定是否必須更改密碼" };
    }

    const { error: signOutError } = await admin.auth.admin.signOut(coachId);
    if (signOutError) {
      console.error("[resetCoachPasswordAction] signOut", { signOutError });
    }

    revalidateCoachPages();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[resetCoachPasswordAction] unexpected", { error });
    return { ok: false, error: "重設密碼時發生錯誤" };
  }
}

export async function deleteCoachAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireEmployer();

    const coachId = String(formData.get("coach_id") ?? "").trim();
    const confirmed = formData.get("confirm_delete") === "1";

    if (!coachId) {
      return { ok: false, error: "找不到教練帳號" };
    }
    if (!confirmed) {
      return { ok: false, error: "請確認刪除此帳號" };
    }

    const coach = await findCoachAccount(coachId);
    if (!coach) {
      return { ok: false, error: "找不到教練帳號" };
    }

    const admin = createAdminClient();
    const { count, error: lessonError } = await admin
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coachId);

    if (lessonError) {
      console.error("[deleteCoachAction] lessons", { lessonError });
      return { ok: false, error: "無法檢查課堂紀錄" };
    }
    if ((count ?? 0) > 0) {
      return { ok: false, error: "此教練仍有課堂紀錄，無法刪除帳號" };
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(coachId);
    if (deleteError) {
      console.error("[deleteCoachAction] deleteUser", { deleteError });
      return { ok: false, error: deleteError.message ?? "刪除帳號失敗" };
    }

    revalidateCoachPages();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[deleteCoachAction] unexpected", { error });
    return { ok: false, error: "刪除帳號時發生錯誤" };
  }
}

async function findCoachAccount(coachId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", coachId)
    .eq("role", "coach")
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data;
}

function revalidateCoachPages() {
  revalidatePath("/employer/coaches");
  revalidatePath("/employer");
  revalidatePath("/employer/salary");
  revalidatePath("/employer/rates");
}
