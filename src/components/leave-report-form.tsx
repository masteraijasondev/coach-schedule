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
  const panel = compact ? "p-1.5" : "p-3";

  return (
    <div className="flex flex-col gap-3">
    <div className={`rounded-xl bg-stone-200 ${panel}`}>
      <p className="mb-2 text-center text-sm font-medium text-stone-900">
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
            報此時段放假
          </SubmitButton>
        </ActionForm>
        {canTakeFullDay ? (
          <ServerActionButton
            action={saveLeaveAction.bind(null, date)}
            confirmMessage="確定當日全日放假？當日可返工時段將會取消。"
            confirmLabel="確定全日放假"
            confirmVariant="leave"
            className="w-full min-h-11 rounded-md border border-stone-300 bg-stone-100 px-2 py-1 text-sm font-medium text-stone-900 hover:bg-stone-200 disabled:opacity-60"
          >
            全日放假
          </ServerActionButton>
        ) : (
          <p className="text-center text-xs text-stone-500">
            當日已有派更，不可全日放假
          </p>
        )}
      </div>
    </div>
    <div className={`rounded-xl bg-red-50 ${panel}`}>
      <p className="mb-2 text-center text-sm font-medium text-red-900">
        報病假
      </p>
      <div className="flex flex-col gap-2">
        <ActionForm
          action={saveSickLeaveAction}
          className="flex flex-col gap-2"
          onSuccess={onSuccess}
        >
          <input type="hidden" name="leave_date" value={date} />
          <AvailabilityTimeFields
            tone="sick"
            compact={compact}
            defaultStartMinute={suggestedStart}
            defaultEndMinute={Math.min(
              suggestedStart + DEFAULT_DURATION_MINUTES,
              MINUTES_PER_DAY,
            )}
          />
          <SubmitButton variant="sick" className="w-full min-w-0">
            報此時段病假
          </SubmitButton>
        </ActionForm>
        <ActionForm action={saveSickLeaveAction} onSuccess={onSuccess}>
          <input type="hidden" name="leave_date" value={date} />
          <input type="hidden" name="full_day" value="1" />
          <SubmitButton variant="sick" className="w-full min-w-0">
            全日病假
          </SubmitButton>
        </ActionForm>
        <p className="text-center text-xs text-red-800">
          未簽到的派更會一併取消。已簽到的時段不能改為病假。
        </p>
      </div>
    </div>
    </div>
  );
}

export function CancelFullDayLeaveButton({
  date,
  sick = false,
}: {
  date: string;
  sick?: boolean;
}) {
  return (
    <ServerActionButton
      action={cancelLeaveAction.bind(null, date)}
      confirmMessage={
        sick
          ? "確定撤銷全日病假？可返工時間同未簽到派更會恢復。"
          : "確定撤銷全日放假？可返工時間會恢復。"
      }
      confirmLabel={sick ? "確定撤銷病假" : "確定撤銷放假"}
      confirmVariant={sick ? "sickQuiet" : "leaveQuiet"}
      className={
        sick
          ? "w-full min-h-11 rounded-md border border-red-200 px-2 py-1 text-xs text-red-800 disabled:opacity-60"
          : "w-full min-h-11 rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-800 disabled:opacity-60"
      }
    >
      {sick ? "撤銷病假" : "撤銷放假"}
    </ServerActionButton>
  );
}
