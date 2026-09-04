"use client";

import { LoadingSpinner } from "@/components/loading-spinner";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel = "處理中…",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex min-h-10 min-w-28 items-center justify-center gap-2 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? (
        <>
          <LoadingSpinner size="sm" label={pendingLabel} className="text-white" />
          <span>{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
