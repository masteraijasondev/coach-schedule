"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function loginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      return { ok: false, error: "請輸入電郵及密碼" };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { ok: false, error: "登入失敗，請檢查電郵或密碼" };
    }

    redirect("/");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error("[loginAction] unexpected", { error });
    return { ok: false, error: "登入時發生錯誤" };
  }
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function changePasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    if (password.length < 8) {
      return { ok: false, error: "密碼至少需要 8 個字元" };
    }
    if (password !== confirm) {
      return { ok: false, error: "兩次輸入的密碼不一致" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "尚未登入" };
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      return { ok: false, error: "更新密碼失敗" };
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id);

    if (profileError) {
      return { ok: false, error: "更新帳號狀態失敗" };
    }

    revalidatePath("/");
    redirect("/");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error("[changePasswordAction] unexpected", { error });
    return { ok: false, error: "更改密碼時發生錯誤" };
  }
}
