"use client";

import { changePasswordAction } from "@/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Field, SubmitButton } from "@/components/ui";
import Link from "next/link";

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">重設密碼</h1>
          <p className="mt-1 text-sm text-stone-500">
            請設定新密碼。完成後會自動進入系統。
          </p>
        </div>
        <ActionForm action={changePasswordAction} className="space-y-4">
          <Field
            label="新密碼"
            name="password"
            type="password"
            required
            minLength={8}
          />
          <Field
            label="確認新密碼"
            name="confirm"
            type="password"
            required
            minLength={8}
          />
          <SubmitButton>儲存新密碼</SubmitButton>
        </ActionForm>
        <p className="text-sm text-stone-600">
          <Link href="/login" className="underline hover:text-stone-900">
            返回登入
          </Link>
        </p>
      </div>
    </div>
  );
}
