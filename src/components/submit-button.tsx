"use client";

import { LoadingSpinner } from "@/components/loading-spinner";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel = "處理中…",
  disabled = false,
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  disabled?: boolean;
  variant?: "primary" | "danger" | "secondary";
  className?: string;
}) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;
  const tone =
    variant === "danger"
      ? "bg-red-700 hover:bg-red-800 text-white"
      : variant === "secondary"
        ? "bg-stone-200 text-stone-800 hover:bg-stone-300"
        : "bg-stone-900 text-white hover:bg-stone-800";

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-busy={pending}
      className={`inline-flex min-h-10 min-w-28 cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70 ${tone} ${className ?? ""}`}
    >
      {pending ? (
        <>
          <LoadingSpinner
            size="sm"
            label={pendingLabel}
            className={variant === "secondary" ? "text-stone-800" : "text-white"}
          />
          <span>{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
