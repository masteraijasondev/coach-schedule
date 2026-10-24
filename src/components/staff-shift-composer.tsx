"use client";

import {
  saveAvailabilityAction,
  saveLeaveAction,
  saveShortBreakAction,
  saveSickLeaveAction,
} from "@/actions/availability";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { ServerActionButton } from "@/components/server-action-button";
import { buttonTone } from "@/components/button-styles";
import { EmphasizedText } from "@/components/data-value";
import { SubmitButton } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

const DEFAULT_DURATION_MINUTES = 60;
const SHIFT_STEP_MINUTES = 15;
const MINUTES_PER_DAY = 1440;

type ReportKind = "work" | "break" | "sick";

const REPORT_KIND: {
  id: ReportKind;
  label: string;
  tone: "primary" | "leave" | "sick";
}[] = [
  { id: "work", label: "可工作", tone: "primary" },
  { id: "break", label: "放假", tone: "leave" },
  { id: "sick", label: "病假", tone: "sick" },
];

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
  leave: "bg-stone-200 text-stone-800",
  sick: "bg-red-50 text-red-900",
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
  const [openFromProps, setOpenFromProps] = useState(defaultOpen);
  if (defaultOpen !== openFromProps) {
    setOpenFromProps(defaultOpen);
    if (defaultOpen) {
      setOpen(true);
    }
  }

  if (!children) {
    return (
      <div
        className={`rounded-2xl px-4 py-3 text-sm tabular-nums ${CHIP_TONE[tone]}`}
      >
        <EmphasizedText text={label} />
      </div>
    );
  }

  return (
    <details
      open={open}
      className={`rounded-2xl open:[&>summary>svg]:rotate-180 ${CHIP_TONE[tone]}`}
    >
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C] [&::-webkit-details-marker]:hidden"
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        <span>
          <EmphasizedText text={label} />
        </span>
        <Chevron />
      </summary>
      <div className="border-t border-black/5 bg-white px-4 py-3">{children}</div>
    </details>
  );
}

export function StaffShiftComposer({
  date,
  suggestedStart,
  canTakeFullDay,
  compact = false,
  pendingShiftLabels = [],
}: {
  date: string;
  suggestedStart: number;
  canTakeFullDay: boolean;
  compact?: boolean;
  pendingShiftLabels?: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ReportKind>("work");
  const namedShifts = pendingShiftLabels.filter((label) => label.length > 0);
  const sickConfirm =
    namedShifts.length > 0
      ? `確定當日全日病假？未簽到的派更會取消：${namedShifts.join("、")}。已簽到的時段不能改為病假。`
      : "確定當日全日病假？未簽到的派更會一併取消。已簽到的時段不能改為病假。";
  const reportAction =
    kind === "work"
      ? saveAvailabilityAction
      : kind === "break"
        ? saveShortBreakAction
        : saveSickLeaveAction;
  const reportLabel =
    kind === "work"
      ? "新增可返工時間"
      : kind === "break"
        ? "報此時段小休"
        : "報此時段病假";

  function closeAndRefresh() {
    setOpen(false);
    router.refresh();
  }

  return (
    <div data-tour="coach-report" className="relative z-[2] flex min-w-0 flex-col gap-2">
      {open ? (
        <div className={`flex flex-col gap-3 rounded-2xl bg-slate-50 ${compact ? "p-2" : "p-3"}`}>
          <button
            type="button"
            aria-expanded
            onClick={() => setOpen(false)}
            className="flex w-full items-center justify-between text-sm font-medium text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]"
          >
            報更 / 報假
            <Chevron up />
          </button>
          <fieldset className="space-y-2">
            <legend className="text-sm text-stone-700">這段時間是</legend>
            <div className="grid grid-cols-3 gap-2">
              {REPORT_KIND.map((option) => {
                const selected = kind === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setKind(option.id)}
                    className={`${selected ? buttonTone[option.tone] : buttonTone.secondary} w-full px-2`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <ActionForm
            key={kind}
            action={reportAction}
            className="flex flex-col gap-3"
            onSuccess={closeAndRefresh}
          >
            <input
              type="hidden"
              name={kind === "work" ? "available_date" : "leave_date"}
              value={date}
            />
            <AvailabilityTimeFields
              compact={compact}
              tone={kind === "sick" ? "sick" : "default"}
              stepMinutes={kind === "work" ? SHIFT_STEP_MINUTES : 30}
              defaultStartMinute={suggestedStart}
              defaultEndMinute={Math.min(
                suggestedStart + DEFAULT_DURATION_MINUTES,
                MINUTES_PER_DAY,
              )}
            />
            <SubmitButton
              variant={
                kind === "work" ? "primary" : kind === "break" ? "leave" : "sick"
              }
              className="w-full min-w-0"
            >
              {reportLabel}
            </SubmitButton>
          </ActionForm>
          {kind === "break" && canTakeFullDay ? (
            <ServerActionButton
              action={saveLeaveAction.bind(null, date)}
              confirmMessage="確定當日全日放假？當日可返工時段將會取消。"
              confirmLabel="確定全日放假"
              confirmVariant="leave"
              variant="leaveQuiet"
              className="w-full"
            >
              改為全日放假
            </ServerActionButton>
          ) : null}
          {kind === "sick" ? (
            <ServerActionButton
              action={async () => {
                const formData = new FormData();
                formData.set("leave_date", date);
                formData.set("full_day", "1");
                return saveSickLeaveAction(null, formData);
              }}
              confirmMessage={sickConfirm}
              confirmLabel="確定全日病假"
              confirmVariant="sick"
              variant="sickQuiet"
              className="w-full"
            >
              改為全日病假
            </ServerActionButton>
          ) : null}
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
