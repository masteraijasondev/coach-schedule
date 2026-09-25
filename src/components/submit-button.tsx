"use client";

import { buttonTone } from "@/components/button-styles";
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
  variant?: "primary" | "danger" | "secondary" | "leave";
  className?: string;
}) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;
  const tone =
    variant === "danger"
      ? buttonTone.danger
      : variant === "leave"
        ? buttonTone.leave
        : variant === "secondary"
          ? buttonTone.secondary
          : buttonTone.primary;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-busy={pending}
      className={`${tone} min-w-28 ${className ?? ""}`}
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
