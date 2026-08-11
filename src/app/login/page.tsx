"use client";

import { loginAction } from "@/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Field, SubmitButton } from "@/components/ui";

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">教練排班與薪資</h1>
          <p className="mt-1 text-sm text-stone-500">請使用機構提供的帳號登入</p>
        </div>
        <ActionForm action={loginAction} className="space-y-4">
          <Field label="電郵" name="email" type="email" required />
          <Field label="密碼" name="password" type="password" required />
          <SubmitButton>登入</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
