"use client";

import { confirmRecoverySessionAction } from "@/actions/auth";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function ConfirmRecovery() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const tokenHash = searchParams.get("token_hash") ?? "";
  const type = searchParams.get("type") ?? "recovery";
  const providerError = searchParams.get("error");
  const [hashSession, setHashSession] = useState<{
    accessToken: string;
    refreshToken: string;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [hashError, setHashError] = useState<string | null>(null);
  const [hashPending, setHashPending] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (accessToken && refreshToken) {
      setHashSession({ accessToken, refreshToken });
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    setReady(true);
  }, []);

  async function continueFromHash() {
    if (!hashSession) {
      return;
    }
    setHashPending(true);
    setHashError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: hashSession.accessToken,
        refresh_token: hashSession.refreshToken,
      });
      if (error) {
        console.error("[ConfirmRecovery] setSession", { message: error.message });
        setHashError("重設連結無效或已過期，請重新申請");
        return;
      }
      window.location.assign("/reset-password");
    } catch (error) {
      console.error("[ConfirmRecovery] setSession unexpected", { error });
      setHashError("重設連結無效或已過期，請重新申請");
      setHashPending(false);
    }
  }

  if (!ready) {
    return (
      <p className="text-sm text-stone-500">正在確認重設連結…</p>
    );
  }

  if (providerError && !code && !tokenHash && !hashSession) {
    return (
      <InvalidLink
        message={
          providerError === "access_denied"
            ? "重設連結未被接受。請在 Supabase 的 Redirect URLs 加入這個網站的 /auth/confirm 後再申請。"
            : "重設連結無效或已過期，請重新申請。"
        }
      />
    );
  }

  if (hashSession) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          連結已確認。按下面按鈕設定新密碼。請勿重新整理。
        </p>
        {hashError ? (
          <p className="text-sm text-red-700" role="alert">
            {hashError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={continueFromHash}
          disabled={hashPending}
          className="inline-flex min-h-10 min-w-28 items-center justify-center rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {hashPending ? "處理中…" : "設定新密碼"}
        </button>
      </div>
    );
  }

  if (!code && !tokenHash) {
    return <InvalidLink message="重設連結無效或已過期，請重新申請。" />;
  }

  return (
    <ActionForm action={confirmRecoverySessionAction} className="space-y-4">
      {code ? <input type="hidden" name="code" value={code} /> : null}
      {tokenHash ? (
        <input type="hidden" name="token_hash" value={tokenHash} />
      ) : null}
      <input type="hidden" name="type" value={type} />
      <p className="text-sm text-stone-600">
        按下面按鈕繼續設定新密碼。請用申請重設時的同一個瀏覽器開啟。
      </p>
      <SubmitButton>設定新密碼</SubmitButton>
    </ActionForm>
  );
}

function InvalidLink({ message }: { message: string }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-red-700" role="alert">
        {message}
      </p>
      <Link href="/forgot-password" className="text-sm text-stone-600 underline">
        重新申請
      </Link>
    </div>
  );
}

export default function ConfirmRecoveryPage() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">確認重設密碼</h1>
        </div>
        <Suspense fallback={<p className="text-sm text-stone-500">正在確認重設連結…</p>}>
          <ConfirmRecovery />
        </Suspense>
      </div>
    </div>
  );
}
