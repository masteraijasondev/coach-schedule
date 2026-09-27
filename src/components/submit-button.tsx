"use client";

import { buttonLabelClass, buttonTone, type ButtonVariant } from "@/components/button-styles";
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
  variant?: ButtonVariant;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;
  const tone = buttonTone[variant];

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
            className={buttonLabelClass(variant)}
          />
          <span>{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
