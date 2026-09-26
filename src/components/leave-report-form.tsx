"use client";

import {
  cancelLeaveAction,
  saveLeaveAction,
  saveShortBreakAction,
  saveSickLeaveAction,
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
  compact = false,
  onSuccess,
}: {
  date: string;
  suggestedStart: number;
  canTakeFullDay: boolean;
  compact?: boolean;
  onSuccess?: () => void;
}) {
  return (
    <div className={`rounded-xl bg-rose-50 ${compact ? "p-1.5" : "p-3"}`}>
      <p className="mb-2 text-center text-sm font-medium text-rose-900">
        報放假
      </p>
      <div className="flex flex-col gap-2">
        <ActionForm
          action={saveShortBreakAction}
          className="flex flex-col gap-2"
          onSuccess={onSuccess}
        >
          <input type="hidden" name="leave_date" value={date} />
          <AvailabilityTimeFields
            tone="leave"
            compact={compact}
            defaultStartMinute={suggestedStart}
            defaultEndMinute={Math.min(
              suggestedStart + DEFAULT_DURATION_MINUTES,
              MINUTES_PER_DAY,
            )}
          />
          <SubmitButton variant="leave" className="w-full min-w-0">
            報此時段
          </SubmitButton>
        </ActionForm>
        {canTakeFullDay ? (
          <ServerActionButton
            action={saveLeaveAction.bind(null, date)}
            confirmMessage="確定當日全日放假？當日可返工時段將會取消。"
            className="w-full min-h-11 rounded-md border border-rose-300 bg-rose-100 px-2 py-1 text-sm font-medium text-rose-900 hover:bg-rose-200 disabled:opacity-60"
          >
            全日放假
          </ServerActionButton>
        ) : (
          <p className="text-center text-xs text-stone-500">
            當日已有派更，不可全日放假
          </p>
        )}
      </div>
      <p className="mb-2 mt-4 text-center text-sm font-medium text-rose-900">
        請病假
      </p>
      <div className="flex flex-col gap-2">
        <ActionForm
          action={saveSickLeaveAction}
          className="flex flex-col gap-2"
          onSuccess={onSuccess}
        >
          <input type="hidden" name="leave_date" value={date} />
          <AvailabilityTimeFields
            tone="leave"
            compact={compact}
            defaultStartMinute={suggestedStart}
            defaultEndMinute={Math.min(
              suggestedStart + DEFAULT_DURATION_MINUTES,
              MINUTES_PER_DAY,
            )}
          />
          <SubmitButton variant="leave" className="w-full min-w-0">
            請此時段病假
          </SubmitButton>
        </ActionForm>
        <ActionForm action={saveSickLeaveAction} onSuccess={onSuccess}>
          <input type="hidden" name="leave_date" value={date} />
          <input type="hidden" name="full_day" value="1" />
          <SubmitButton variant="leave" className="w-full min-w-0">
            全日病假
          </SubmitButton>
        </ActionForm>
        <p className="text-center text-xs text-stone-500">
          未簽到的派更會一併取消。已簽到的時段不能改為病假。
        </p>
      </div>
    </div>
  );
}

export function CancelFullDayLeaveButton({ date }: { date: string }) {
  return (
    <ServerActionButton
      action={cancelLeaveAction.bind(null, date)}
      confirmMessage="確定取消當日全日放假？"
      className="w-full min-h-11 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-800 disabled:opacity-60"
    >
      取消放假
    </ServerActionButton>
  );
}
