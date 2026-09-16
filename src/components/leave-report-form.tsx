"use client";

import {
  cancelLeaveAction,
  saveLeaveAction,
  saveShortBreakAction,
} from "@/actions/availability";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { ServerActionButton } from "@/components/server-action-button";
import { SubmitButton } from "@/components/ui";

const DEFAULT_DURATION_MINUTES = 60;
const MINUTES_PER_DAY = 1440;

export function LeaveReportForm({
  date,
  suggestedStart,
  canTakeFullDay,
}: {
  date: string;
  suggestedStart: number;
  canTakeFullDay: boolean;
}) {
  return (
    <details className="relative z-[2] rounded-sm border border-dashed border-rose-200 bg-white text-xs">
      <summary className="cursor-pointer list-none px-1 py-1 text-center font-medium text-rose-800">
        報放假
      </summary>
      <div className="min-w-[9rem] space-y-2 border-t border-rose-100 p-2">
        <ActionForm
          action={saveShortBreakAction}
          className="space-y-2"
        >
          <input type="hidden" name="leave_date" value={date} />
          <AvailabilityTimeFields
            defaultStartMinute={suggestedStart}
            defaultEndMinute={Math.min(
              suggestedStart + DEFAULT_DURATION_MINUTES,
              MINUTES_PER_DAY,
            )}
          />
          <SubmitButton>報此時段</SubmitButton>
        </ActionForm>
        {canTakeFullDay ? (
          <ServerActionButton
            action={saveLeaveAction.bind(null, date)}
            confirmMessage="確定這天全日放假？當日可返工時段會被取消。"
            className="w-full min-h-11 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-800 disabled:opacity-60"
          >
            全日放假
          </ServerActionButton>
        ) : (
          <p className="text-center text-[10px] text-stone-500">
            已有派更，不可全日放假
          </p>
        )}
      </div>
    </details>
  );
}

export function CancelFullDayLeaveButton({ date }: { date: string }) {
  return (
    <ServerActionButton
      action={cancelLeaveAction.bind(null, date)}
      confirmMessage="確定取消這天全日放假？"
      className="w-full min-h-11 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-800 disabled:opacity-60"
    >
      取消放假
    </ServerActionButton>
  );
}
