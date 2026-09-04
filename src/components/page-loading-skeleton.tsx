export function PageLoadingSkeleton({
  label = "載入中…",
}: {
  label?: string;
}) {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      <section
        className="space-y-4 rounded-lg border border-stone-200 bg-white p-4"
        aria-hidden="true"
      >
        <div className="h-5 w-32 animate-pulse rounded-md bg-stone-200 motion-reduce:animate-none" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-stone-100 motion-reduce:animate-none" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 14 }).map((_, index) => (
            <div
              key={index}
              className="min-h-14 animate-pulse rounded-md bg-stone-100 motion-reduce:animate-none"
            />
          ))}
        </div>
      </section>
      <section
        className="space-y-3 rounded-lg border border-stone-200 bg-white p-4"
        aria-hidden="true"
      >
        <div className="h-5 w-40 animate-pulse rounded-md bg-stone-200 motion-reduce:animate-none" />
        <div className="h-4 w-3/4 animate-pulse rounded-md bg-stone-100 motion-reduce:animate-none" />
        <div className="h-4 w-1/2 animate-pulse rounded-md bg-stone-100 motion-reduce:animate-none" />
        <div className="h-10 w-28 animate-pulse rounded-md bg-stone-200 motion-reduce:animate-none" />
      </section>
    </div>
  );
}
