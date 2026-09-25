const buttonBase =
  "inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3.5 text-sm font-semibold shadow-sm transition active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:active:translate-y-0";

export const buttonTone = {
  primary: `${buttonBase} border-stone-900 bg-stone-900 text-white hover:bg-stone-800 focus-visible:outline-stone-900`,
  secondary: `${buttonBase} border-stone-300 bg-white text-stone-800 hover:bg-stone-50 focus-visible:outline-stone-400`,
  danger: `${buttonBase} border-red-700 bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-700`,
  leave: `${buttonBase} border-rose-800 bg-rose-700 text-white hover:bg-rose-800 focus-visible:outline-rose-800`,
} as const;
