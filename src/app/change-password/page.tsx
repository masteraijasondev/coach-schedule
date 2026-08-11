"use client";

import { changePasswordAction } from "@/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Field, SubmitButton } from "@/components/ui";

export default function ChangePasswordPage() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">更改密碼</h1>
          <p className="mt-1 text-sm text-stone-500">
            首次登入必須設定新密碼後才能繼續使用
          </p>
        </div>
        <ActionForm action={changePasswordAction} className="space-y-4">
          <Field label="新密碼" name="password" type="password" required />
          <Field label="確認新密碼" name="confirm" type="password" required />
          <SubmitButton>儲存並繼續</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
