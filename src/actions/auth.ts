"use server";

import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/env";
import type { ActionResult } from "@/lib/types";
import { headers } from "next/headers";
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

async function resolveSiteOrigin(): Promise<string> {
  const configured = getSiteUrl();
  if (configured) {
    return configured;
  }
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  if (origin) {
    return origin;
  }
  const host =
    headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  if (host) {
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
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

export async function requestPasswordResetAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return { ok: false, error: "請輸入有效電郵" };
    }

    const origin = await resolveSiteOrigin();
    const redirectTo = `${origin}/auth/confirm?next=/reset-password`;
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      console.error("[requestPasswordResetAction]", {
        message: error.message,
        status: error.status,
      });
      return { ok: false, error: "無法寄出重設連結，請稍後再試" };
    }

    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[requestPasswordResetAction] unexpected", { error });
    return { ok: false, error: "無法寄出重設連結，請稍後再試" };
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
