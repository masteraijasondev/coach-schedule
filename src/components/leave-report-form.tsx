"use client";

import { cancelLeaveAction } from "@/actions/availability";
import { ServerActionButton } from "@/components/server-action-button";

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
      variant={sick ? "sickQuiet" : "leaveQuiet"}
      className="w-full"
    >
      {sick ? "撤銷病假" : "撤銷放假"}
    </ServerActionButton>
  );
}
