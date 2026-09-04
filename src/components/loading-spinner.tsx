type Size = "sm" | "md" | "lg";

const SIZE_CLASS: Record<Size, string> = {
  sm: "size-3.5 border-[1.5px]",
  md: "size-5 border-2",
  lg: "size-8 border-2",
};

export function LoadingSpinner({
  size = "md",
  className = "",
  label = "載入中…",
}: {
  size?: Size;
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center justify-center ${className}`}
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className={`inline-block shrink-0 rounded-full border-current border-r-transparent motion-safe:animate-spin motion-reduce:opacity-60 ${SIZE_CLASS[size]}`}
      />
    </span>
  );
}
