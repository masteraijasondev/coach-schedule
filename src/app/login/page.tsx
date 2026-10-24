"use client";

import { loginAction } from "@/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Field, SubmitButton } from "@/components/ui";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-white px-4 py-12 text-[#2C2C2C] [font-family:var(--font-barlow),var(--font-noto-sans-tc),sans-serif]">
      <div className="w-full max-w-md space-y-6 border-t-4 border-[#FF6B00] bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">教練排班與薪資</h1>
          <p className="mt-1 text-sm text-[#525252]">請使用機構提供的帳號登入</p>
        </div>
        <ActionForm action={loginAction} className="space-y-4">
          <Field label="電郵" name="email" type="email" required />
          <Field label="密碼" name="password" type="password" required />
          <div className="flex items-center justify-between gap-3">
            <SubmitButton>登入</SubmitButton>
            <Link
              href="/forgot-password"
              className="text-sm text-stone-600 underline hover:text-stone-900"
            >
              忘記密碼？
            </Link>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
