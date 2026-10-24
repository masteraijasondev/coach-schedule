const FACT_SOURCE =
  "(港幣\\s*\\$\\d+(?:\\.\\d+)?|\\d{4}-\\d{2}(?:-\\d{2})?(?:\\s+\\d{1,2}:\\d{2})?|\\d{1,2}:\\d{2}(?:\\s*[–-]\\s*(?:\\d{4}-\\d{2}-\\d{2}\\s+)?\\d{1,2}:\\d{2})?|\\d+月\\d+日|\\d+(?:\\.\\d+)?\\s*小時)";

export function DataValue({
  children,
  figure = false,
  className,
}: {
  children: React.ReactNode;
  figure?: boolean;
  className?: string;
}) {
  return (
    <span
      className={[
        figure
          ? "text-base font-bold tabular-nums tracking-tight"
          : "font-bold tabular-nums",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

export function EmphasizedText({
  text,
  figure = false,
}: {
  text: string;
  figure?: boolean;
}) {
  const parts = text.split(new RegExp(FACT_SOURCE, "g"));
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <DataValue key={`${part}-${index}`} figure={figure}>
            {part}
          </DataValue>
        ) : (
          part
        ),
      )}
    </>
  );
}
