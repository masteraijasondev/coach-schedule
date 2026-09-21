"use client";

import { Field } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const linkError = searchParams.get("error") === "link";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const email = String(new FormData(event.currentTarget).get("email") ?? "")
        .trim()
        .toLowerCase();
      if (!email || !email.includes("@")) {
        setError("請輸入有效電郵");
        return;
      }
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/auth/confirm` },
      );
      if (resetError) {
        console.error("[ForgotPasswordForm] resetPasswordForEmail", {
          message: resetError.message,
        });
        setError("無法寄出重設連結，請稍後再試");
        return;
      }
      setSent(true);
    } catch (submitError) {
      console.error("[ForgotPasswordForm] unexpected", { error: submitError });
      setError("無法寄出重設連結，請稍後再試");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-6 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">忘記密碼</h1>
        <p className="mt-1 text-sm text-stone-500">
          輸入帳號電郵，我們會寄出重設密碼連結（如該電郵已註冊）。請用這個瀏覽器開啟連結。
        </p>
      </div>
      {linkError ? (
        <p className="text-sm text-red-700" role="alert">
          重設連結無效或已過期，請重新申請。
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-4" aria-busy={pending}>
        <Field label="電郵" name="email" type="email" required />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-10 min-w-28 cursor-pointer items-center justify-center rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? "處理中…" : "寄出重設連結"}
        </button>
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {sent ? (
          <p className="text-sm text-emerald-700">
            如該電郵已註冊，我們已寄出重設連結。請用這個瀏覽器開啟，並檢查垃圾郵件。
          </p>
        ) : null}
      </form>
      <p className="text-sm text-stone-600">
        <Link href="/login" className="underline hover:text-stone-900">
          返回登入
        </Link>
      </p>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <Suspense
        fallback={
          <div className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-500 shadow-sm">
            載入中…
          </div>
        }
      >
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
