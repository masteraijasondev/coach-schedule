"use client";

import { requestPasswordResetAction } from "@/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Field, SubmitButton } from "@/components/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const linkError = searchParams.get("error") === "link";

  return (
    <div className="w-full max-w-md space-y-6 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">忘記密碼</h1>
        <p className="mt-1 text-sm text-stone-500">
          輸入帳號電郵，我們會寄出重設密碼連結（如該電郵已註冊）。
        </p>
      </div>
      {linkError ? (
        <p className="text-sm text-red-700" role="alert">
          重設連結無效或已過期，請重新申請。
        </p>
      ) : null}
      <ActionForm
        action={requestPasswordResetAction}
        className="space-y-4"
        successMessage="如該電郵已註冊，我們已寄出重設連結。請檢查收件匣及垃圾郵件。"
      >
        <Field label="電郵" name="email" type="email" required />
        <SubmitButton>寄出重設連結</SubmitButton>
      </ActionForm>
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
