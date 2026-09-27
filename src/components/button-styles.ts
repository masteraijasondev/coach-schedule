const buttonBase =
  "inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3.5 text-sm font-semibold shadow-sm transition active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:active:translate-y-0";

export const buttonTone = {
  primary: `${buttonBase} border-stone-900 bg-stone-900 text-white hover:bg-stone-800 focus-visible:outline-stone-900`,
  secondary: `${buttonBase} border-stone-300 bg-white text-stone-800 hover:bg-stone-50 focus-visible:outline-stone-400`,
  danger: `${buttonBase} border-red-700 bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-700`,
  leave: `${buttonBase} border-stone-700 bg-stone-500 text-white hover:bg-stone-600 focus-visible:outline-stone-700`,
  sick: `${buttonBase} border-red-800 bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-800`,
  checkIn: `${buttonBase} border-emerald-800 bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:outline-emerald-800`,
  confirmed: `${buttonBase} border-sky-800 bg-sky-700 text-white hover:bg-sky-800 focus-visible:outline-sky-800`,
  released: `${buttonBase} border-stone-400 bg-stone-200 text-stone-800 hover:bg-stone-300 focus-visible:outline-stone-500`,
  slot: `${buttonBase} border-amber-600 bg-amber-400 text-amber-950 hover:bg-amber-500 focus-visible:outline-amber-700`,
  leaveQuiet: `${buttonBase} border-stone-400 bg-white text-stone-800 hover:bg-stone-100 focus-visible:outline-stone-600`,
  sickQuiet: `${buttonBase} border-red-300 bg-white text-red-800 hover:bg-red-50 focus-visible:outline-red-700`,
  confirmedQuiet: `${buttonBase} border-sky-300 bg-white text-sky-900 hover:bg-sky-50 focus-visible:outline-sky-700`,
} as const;

export type ButtonVariant = keyof typeof buttonTone;

const LIGHT_LABEL: ReadonlySet<ButtonVariant> = new Set([
  "primary",
  "danger",
  "leave",
  "sick",
  "checkIn",
  "confirmed",
]);

export function buttonLabelClass(variant: ButtonVariant): string {
  return LIGHT_LABEL.has(variant) ? "text-white" : "";
}
