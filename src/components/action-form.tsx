"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/types";

type Props = {
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  onSuccess?: () => void;
};

export function ActionForm({ action, children, className, onSuccess }: Props) {
  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult | null, formData: FormData) => {
      try {
        const result = await action(prev, formData);
        if (result.ok) {
          onSuccess?.();
        }
        return result;
      } catch (error) {
        // Let Next.js redirects (login / change-password) propagate.
        if (
          typeof error === "object" &&
          error !== null &&
          "digest" in error &&
          String((error as { digest?: string }).digest).startsWith(
            "NEXT_REDIRECT",
          )
        ) {
          throw error;
        }
        console.error("[ActionForm]", { error });
        return { ok: false, error: "操作失敗，請再試一次" };
      }
    },
    null,
  );

  return (
    <form action={formAction} className={className}>
      {children}
      {pending ? (
        <p className="text-sm text-stone-500">處理中…</p>
      ) : null}
      {state && !state.ok ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      {state && state.ok ? (
        <p className="text-sm text-emerald-700">已儲存</p>
      ) : null}
    </form>
  );
}
