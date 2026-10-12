import { StaffShiftChip } from "@/components/staff-shift-composer";
import { Panel } from "@/components/ui";
import {
  teamBarChipLabel,
  type TeamScheduleBar,
} from "@/lib/team-schedule";

export function TeamDaySchedule({
  bars,
}: {
  bars: TeamScheduleBar[];
}) {
  return (
    <div className="mt-4 border-t border-stone-200 pt-3">
      <p className="text-sm font-medium text-stone-800">其他同事</p>
      {bars.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500">當日沒有其他同事的行程</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {bars.map((bar) => (
            <StaffShiftChip
              key={bar.id}
              label={teamBarChipLabel(bar)}
              tone={bar.variant}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TeamWeekSchedule({
  days,
  bars,
}: {
  days: string[];
  bars: TeamScheduleBar[];
}) {
  const groups = days
    .map((date) => ({
      date,
      bars: bars.filter((bar) => bar.date === date),
    }))
    .filter((group) => group.bars.length > 0);

  return (
    <Panel title="本週其他同事">
      {groups.length === 0 ? (
        <p className="text-sm text-stone-500">本週其他同事沒有行程</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.date} className="flex flex-col gap-2">
              <p className="text-sm font-medium text-stone-700">{group.date}</p>
              {group.bars.map((bar) => (
                <StaffShiftChip
                  key={bar.id}
                  label={teamBarChipLabel(bar)}
                  tone={bar.variant}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
