"use client";

import { LoadingSpinner } from "@/components/loading-spinner";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/types";

type Props = {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  confirmMessage?: string;
};

export function ServerActionButton({
  action,
  children,
  className,
  confirmMessage,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  function runAction() {
    setError(null);
    setAsking(false);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch (err) {
        console.error("[ServerActionButton]", { error: err });
        setError("操作失敗，請再試一次");
      }
    });
  }

  return (
    <div className="space-y-1">
      {asking && confirmMessage ? (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2">
          <p className="text-sm text-amber-950">{confirmMessage}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-stone-900 px-3 text-sm text-white disabled:opacity-60"
              onClick={runAction}
            >
              確定
            </button>
            <button
              type="button"
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-stone-300 px-3 text-sm disabled:opacity-60"
              onClick={() => setAsking(false)}
            >
              返回
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          aria-busy={pending}
          className={`inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed ${className ?? ""}`}
          onClick={() => {
            if (confirmMessage) {
              setAsking(true);
              return;
            }
            runAction();
          }}
        >
          {pending ? (
            <>
              <LoadingSpinner size="sm" label="處理中…" />
              <span>處理中…</span>
            </>
          ) : (
            children
          )}
        </button>
      )}
      {error ? (
        <p className="max-w-xs text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
