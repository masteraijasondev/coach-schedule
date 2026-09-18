export const STAFF_KINDS = ["operations", "coach"] as const;
export type StaffKind = (typeof STAFF_KINDS)[number];

export const CALENDAR_STATUSES = [
  "available",
  "assigned",
  "leave",
  "checked_in",
] as const;
export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];

export const STAFF_KIND_LABELS: Record<StaffKind, string> = {
  operations: "營運",
  coach: "教練",
};

export const CALENDAR_STATUS_LABELS: Record<CalendarStatus, string> = {
  available: "待公司派更",
  assigned: "已確認",
  leave: "放假",
  checked_in: "已確認簽到",
};

export type FilterStaff = {
  id: string;
  full_name: string;
  staff_kind: StaffKind;
};

export type CalendarFilter = {
  staffIds: string[];
  statuses: CalendarStatus[];
};

function parseCsv<T extends string>(
  raw: string | null | undefined,
  allowed: readonly T[],
): T[] | null {
  if (raw == null) {
    return null;
  }
  const allowedSet = new Set<string>(allowed);
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is T => allowedSet.has(part));
}

export function parseStaffKind(raw: string | null | undefined): StaffKind {
  return raw === "operations" ? "operations" : "coach";
}

export function parseCalendarFilter(
  params: { staff?: string | null; status?: string | null },
  staff: FilterStaff[],
): CalendarFilter {
  const allStaffIds = staff.map((person) => person.id);
  const staffIds = parseCsv(params.staff, allStaffIds);
  const statuses = parseCsv(params.status, CALENDAR_STATUSES);
  return {
    staffIds: staffIds ?? allStaffIds,
    statuses: statuses ?? [...CALENDAR_STATUSES],
  };
}

export function calendarFilterQuery(
  filter: CalendarFilter,
  staff: FilterStaff[],
): { staff?: string; status?: string } {
  const allStaffIds = staff.map((person) => person.id);
  const allStaffSelected =
    allStaffIds.length === filter.staffIds.length &&
    allStaffIds.every((id) => filter.staffIds.includes(id));
  const allStatusesSelected =
    filter.statuses.length === CALENDAR_STATUSES.length;
  return {
    staff: allStaffSelected ? undefined : filter.staffIds.join(","),
    status: allStatusesSelected ? undefined : filter.statuses.join(","),
  };
}

export function staffKindSelected(
  staff: FilterStaff[],
  staffIds: string[],
  kind: StaffKind,
): { checked: boolean; indeterminate: boolean } {
  const ofKind = staff.filter((person) => person.staff_kind === kind);
  if (ofKind.length === 0) {
    return { checked: false, indeterminate: false };
  }
  const selectedCount = ofKind.filter((person) =>
    staffIds.includes(person.id),
  ).length;
  return {
    checked: selectedCount === ofKind.length,
    indeterminate: selectedCount > 0 && selectedCount < ofKind.length,
  };
}

export function toggleStaffKind(
  staff: FilterStaff[],
  staffIds: string[],
  kind: StaffKind,
): string[] {
  const ofKind = staff
    .filter((person) => person.staff_kind === kind)
    .map((person) => person.id);
  const selected = new Set(staffIds);
  const allOn = ofKind.length > 0 && ofKind.every((id) => selected.has(id));
  if (allOn) {
    for (const id of ofKind) {
      selected.delete(id);
    }
  } else {
    for (const id of ofKind) {
      selected.add(id);
    }
  }
  return staff.filter((person) => selected.has(person.id)).map((person) => person.id);
}

export function toggleId<T extends string>(current: T[], id: T, all: readonly T[]): T[] {
  const selected = new Set(current);
  if (selected.has(id)) {
    selected.delete(id);
  } else {
    selected.add(id);
  }
  return all.filter((item) => selected.has(item));
}

export function lessonStatusVisible(
  status: string | undefined,
  statuses: CalendarStatus[],
): boolean {
  if (status === "assigned") {
    return statuses.includes("assigned");
  }
  if (status === "completed") {
    return statuses.includes("checked_in");
  }
  return false;
}

export function variantVisible(
  variant: "slot" | "leave" | "pending" | "confirmed",
  statuses: CalendarStatus[],
): boolean {
  if (variant === "slot") {
    return statuses.includes("available");
  }
  if (variant === "pending") {
    return statuses.includes("assigned");
  }
  if (variant === "leave") {
    return statuses.includes("leave");
  }
  return statuses.includes("checked_in");
}
