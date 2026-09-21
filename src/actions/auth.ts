"use server";

import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { ActionResult } from "@/lib/types";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

function recoveryLinkError(message: string): string {
  if (
    message.includes("code verifier") ||
    message.includes("both auth code and code verifier")
  ) {
    return "請用申請重設時的同一個瀏覽器開啟連結，或重新申請";
  }
  return "重設連結無效或已過期，請重新申請";
}

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
      console.error("[loginAction] signIn", {
        message: error.message,
        status: error.status,
      });
      return { ok: false, error: "登入失敗，請檢查電郵或密碼" };
    }

    revalidatePath("/", "layout");
    redirect("/");
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    console.error("[loginAction] unexpected", { error });
    return { ok: false, error: "登入時發生錯誤" };
  }
}

export async function confirmRecoverySessionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const code = String(formData.get("code") ?? "").trim();
    const tokenHash = String(formData.get("token_hash") ?? "").trim();
    const type = (String(formData.get("type") ?? "recovery") ||
      "recovery") as EmailOtpType;
    const supabase = await createClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[confirmRecoverySessionAction] exchangeCodeForSession", {
          message: error.message,
        });
        return { ok: false, error: recoveryLinkError(error.message) };
      }
    } else if (tokenHash) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (error) {
        console.error("[confirmRecoverySessionAction] verifyOtp", {
          message: error.message,
          type,
        });
        return { ok: false, error: recoveryLinkError(error.message) };
      }
    } else {
      return { ok: false, error: "重設連結無效或已過期，請重新申請" };
    }

    redirect("/reset-password");
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    console.error("[confirmRecoverySessionAction] unexpected", { error });
    return { ok: false, error: "重設連結無效或已過期，請重新申請" };
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
      console.error("[changePasswordAction] updateUser", {
        message: updateError.message,
      });
      return {
        ok: false,
        error:
          updateError.message.includes("different")
            ? "新密碼不可與舊密碼相同"
            : "更新密碼失敗",
      };
    }

    const { data: updated, error: profileError } = await supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id)
      .select("role, must_change_password")
      .maybeSingle();

    if (profileError || !updated || updated.must_change_password) {
      console.error("[changePasswordAction] profile", { profileError, updated });
      return { ok: false, error: "更新帳號狀態失敗" };
    }

    revalidatePath("/", "layout");
    redirect(updated.role === "employer" ? "/employer" : "/coach");
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    console.error("[changePasswordAction] unexpected", { error });
    return { ok: false, error: "更改密碼時發生錯誤" };
  }
}
