type Props = {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  step?: string;
  min?: string;
};

export function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  step,
  min,
}: Props) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-stone-700">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        step={step}
        min={min}
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
      />
    </label>
  );
}

export function SelectField({
  label,
  name,
  required,
  options,
  defaultValue,
  allowEmpty,
  emptyLabel = "— 請選擇 —",
}: {
  label: string;
  name: string;
  required?: boolean;
  options: { value: string; label: string }[];
  defaultValue?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-stone-700">{label}</span>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
      >
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
