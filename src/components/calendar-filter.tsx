"use client";

import {
  CALENDAR_STATUSES,
  CALENDAR_STATUS_LABELS,
  STAFF_KIND_LABELS,
  STAFF_KINDS,
  staffKindSelected,
  toggleId,
  toggleStaffKind,
  type CalendarFilter,
  type CalendarStatus,
  type FilterStaff,
} from "@/lib/calendar-filter";

function Checkbox({
  label,
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-stone-800">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        ref={(node) => {
          if (node) {
            node.indeterminate = indeterminate;
          }
        }}
        onChange={onChange}
        className="h-4 w-4 rounded border-stone-300 text-stone-900 disabled:cursor-not-allowed"
      />
      {label}
    </label>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
        {title}
      </legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">{children}</div>
    </fieldset>
  );
}

export function CalendarFilterBar({
  staff,
  filter,
  onChange,
}: {
  staff: FilterStaff[];
  filter: CalendarFilter;
  onChange: (next: CalendarFilter) => void;
}) {
  function setStaffIds(staffIds: string[]) {
    onChange({ ...filter, staffIds });
  }

  function setStatuses(statuses: CalendarStatus[]) {
    onChange({ ...filter, statuses });
  }

  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-sm text-stone-500">
        勾選要看的角色、員工與狀態，月曆格內只顯示符合的時段。
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        <FilterGroup title="Role">
          {STAFF_KINDS.map((kind) => {
            const state = staffKindSelected(staff, filter.staffIds, kind);
            const hasKind = staff.some((person) => person.staff_kind === kind);
            return (
              <Checkbox
                key={kind}
                label={STAFF_KIND_LABELS[kind]}
                checked={state.checked}
                indeterminate={state.indeterminate}
                disabled={!hasKind}
                onChange={() =>
                  setStaffIds(toggleStaffKind(staff, filter.staffIds, kind))
                }
              />
            );
          })}
        </FilterGroup>
        <FilterGroup title="Staff">
          {staff.map((person) => (
            <Checkbox
              key={person.id}
              label={person.full_name}
              checked={filter.staffIds.includes(person.id)}
              onChange={() =>
                setStaffIds(
                  toggleId(
                    filter.staffIds,
                    person.id,
                    staff.map((item) => item.id),
                  ),
                )
              }
            />
          ))}
          {staff.length === 0 ? (
            <p className="text-sm text-stone-500">尚未有員工</p>
          ) : null}
        </FilterGroup>
        <FilterGroup title="Status">
          {CALENDAR_STATUSES.map((status) => (
            <Checkbox
              key={status}
              label={CALENDAR_STATUS_LABELS[status]}
              checked={filter.statuses.includes(status)}
              onChange={() =>
                setStatuses(
                  toggleId(filter.statuses, status, CALENDAR_STATUSES),
                )
              }
            />
          ))}
        </FilterGroup>
      </div>
    </div>
  );
}
