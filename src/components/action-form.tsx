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
      const result = await action(prev, formData);
      if (result.ok) {
        onSuccess?.();
      }
      return result;
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
