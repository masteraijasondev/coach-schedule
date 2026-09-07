export const WEEK_GRID_START_MINUTE = 7 * 60;
export const WEEK_GRID_END_MINUTE = 22 * 60;
export const WEEK_HOUR_HEIGHT = 48;

export function weekGridRange(
  slots: { start_minute: number; end_minute: number }[],
): { start: number; end: number } {
  let start = WEEK_GRID_START_MINUTE;
  let end = WEEK_GRID_END_MINUTE;
  for (const slot of slots) {
    start = Math.min(start, Math.floor(slot.start_minute / 60) * 60);
    end = Math.max(end, Math.ceil(slot.end_minute / 60) * 60);
  }
  return {
    start: Math.max(0, start),
    end: Math.min(24 * 60, Math.max(start + 60, end)),
  };
}

export function weekHourMarks(startMinute: number, endMinute: number): number[] {
  const hours: number[] = [];
  for (let minute = startMinute; minute < endMinute; minute += 60) {
    hours.push(minute);
  }
  return hours;
}

export function eventPosition(
  startMinute: number,
  endMinute: number,
  gridStart: number,
  gridEnd: number,
  hourHeight = WEEK_HOUR_HEIGHT,
): { top: number; height: number } {
  const start = Math.min(Math.max(startMinute, gridStart), gridEnd);
  const end = Math.min(Math.max(endMinute, start + 15), gridEnd);
  return {
    top: ((start - gridStart) / 60) * hourHeight,
    height: Math.max(((end - start) / 60) * hourHeight, 22),
  };
}
