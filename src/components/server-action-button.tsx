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
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        className={`inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed ${className ?? ""}`}
        onClick={() => {
          if (confirmMessage && !window.confirm(confirmMessage)) {
            return;
          }
          setError(null);
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
      {error ? (
        <p className="max-w-xs text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
