type AlertSeverity = "success" | "info" | "warning" | "error";

const STYLE = {
  filled: {
    success: "bg-emerald-800 text-white",
    info: "bg-[#2C2C2C] text-white",
    warning: "bg-orange-900 text-white",
    error: "bg-red-800 text-white",
  },
} as const satisfies Record<"filled", Record<AlertSeverity, string>>;

function SeverityIcon({ severity }: { severity: AlertSeverity }) {
  const common = {
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
    className: "size-5 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (severity === "success") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16 9" />
      </svg>
    );
  }
  if (severity === "info") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 8h.01" />
      </svg>
    );
  }
  if (severity === "warning") {
    return (
      <svg {...common}>
        <path d="M12 3 2.5 20h19L12 3z" />
        <path d="M12 9v5" />
        <path d="M12 17h.01" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

export function Alert({
  severity,
  variant = "filled",
  children,
  className,
}: {
  severity: AlertSeverity;
  variant?: "filled";
  children: React.ReactNode;
  className?: string;
}) {
  const polite = severity === "success" || severity === "info";
  return (
    <div
      role={polite ? "status" : "alert"}
      aria-atomic="true"
      className={[
        "flex items-start gap-2 rounded-md px-3 py-2 text-sm leading-5",
        "[&_a]:underline [&_button]:underline",
        "[&_a:focus-visible]:outline-white [&_button:focus-visible]:outline-white",
        STYLE[variant][severity],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <SeverityIcon severity={severity} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
