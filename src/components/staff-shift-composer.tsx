"use client";

import { saveAvailabilityAction } from "@/actions/availability";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { LeaveReportForm } from "@/components/leave-report-form";
import { SubmitButton } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const DEFAULT_DURATION_MINUTES = 60;
const MINUTES_PER_DAY = 1440;

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`size-4 shrink-0 text-stone-400 ${up ? "rotate-180" : ""}`}
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
        d="m4 6 4 4 4-4"
      />
    </svg>
  );
}

const CHIP_TONE = {
  slot: "bg-amber-100 text-amber-950",
  pending: "bg-emerald-50 text-emerald-950",
  confirmed: "bg-sky-50 text-sky-950",
  leave: "bg-rose-50 text-rose-900",
  released: "bg-stone-100 text-stone-500",
  staff: "border border-stone-200 bg-white text-stone-900",
} as const;

export function StaffShiftChip({
  label,
  tone,
  children,
  defaultOpen = false,
}: {
  label: string;
  tone: keyof typeof CHIP_TONE;
  children?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
    }
  }, [defaultOpen]);

  if (!children) {
    return (
      <div
        className={`rounded-2xl px-4 py-3 text-sm font-medium tabular-nums ${CHIP_TONE[tone]}`}
      >
        {label}
      </div>
    );
  }

  return (
    <details
      open={open}
      className={`rounded-2xl open:[&>summary>svg]:rotate-180 ${CHIP_TONE[tone]}`}
    >
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium tabular-nums [&::-webkit-details-marker]:hidden"
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        <span>{label}</span>
        <Chevron />
      </summary>
      <div className="border-t border-black/5 bg-white p-3">{children}</div>
    </details>
  );
}

export function StaffShiftComposer({
  date,
  suggestedStart,
  canTakeFullDay,
  compact = false,
}: {
  date: string;
  suggestedStart: number;
  canTakeFullDay: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function closeAndRefresh() {
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="relative z-[2] flex min-w-0 flex-col gap-2">
      {open ? (
        <div className={`rounded-2xl bg-slate-50 ${compact ? "p-1.5" : "p-3"}`}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mb-3 flex w-full items-center justify-between text-sm font-medium text-stone-800"
          >
            報更 / 報假
            <Chevron up />
          </button>
          <div className={`rounded-xl bg-slate-100 ${compact ? "p-1.5" : "p-3"}`}>
            <p className="mb-2 text-center text-sm font-medium text-stone-700">
              報更
            </p>
            <ActionForm
              action={saveAvailabilityAction}
              className="flex flex-col gap-2"
              onSuccess={closeAndRefresh}
            >
              <input type="hidden" name="available_date" value={date} />
              <AvailabilityTimeFields
                compact={compact}
                defaultStartMinute={suggestedStart}
                defaultEndMinute={Math.min(
                  suggestedStart + DEFAULT_DURATION_MINUTES,
                  MINUTES_PER_DAY,
                )}
              />
              <SubmitButton className="w-full min-w-0">新增</SubmitButton>
            </ActionForm>
          </div>
          <div className="mt-3">
            <LeaveReportForm
              date={date}
              suggestedStart={suggestedStart}
              canTakeFullDay={canTakeFullDay}
              compact={compact}
              onSuccess={closeAndRefresh}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-label="新增可返工或放假時段"
          className={`flex w-full cursor-pointer items-center rounded-2xl bg-slate-100 font-medium text-stone-600 transition-colors hover:bg-slate-200 active:bg-slate-300 ${
            compact ? "h-8 justify-center px-2" : "justify-between px-4 py-3 text-sm"
          }`}
        >
          {compact ? null : <span>報更 / 報假</span>}
          <span aria-hidden className="text-xl font-light leading-none text-stone-500">
            ＋
          </span>
        </button>
      )}
    </div>
  );
}
