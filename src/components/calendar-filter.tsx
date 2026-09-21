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
  type StaffKind,
} from "@/lib/calendar-filter";
import type { ReactNode } from "react";

const STATUS_DOT: Record<CalendarStatus, string> = {
  available: "bg-amber-400",
  assigned: "bg-emerald-400",
  leave: "bg-rose-400",
  checked_in: "bg-sky-500",
  released: "bg-stone-400",
};

function chipClass(
  active: boolean,
  mixed = false,
  disabled = false,
  shape: "pill" | "group" = "pill",
) {
  return [
    "inline-flex min-h-11 cursor-pointer items-center gap-1.5 border px-3 text-sm transition-colors disabled:cursor-not-allowed sm:min-h-9",
    shape === "group" ? "rounded-md font-medium" : "rounded-full",
    disabled
      ? "border-stone-200 bg-stone-50 text-stone-400"
      : active
        ? mixed
          ? "border-stone-400 bg-stone-100 text-stone-800"
          : "border-stone-900 bg-stone-900 text-white"
        : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50",
  ].join(" ");
}

function Chip({
  label,
  pressed,
  mixed = false,
  disabled = false,
  shape = "pill",
  dotClassName,
  ariaLabel,
  onClick,
}: {
  label: string;
  pressed: boolean;
  mixed?: boolean;
  disabled?: boolean;
  shape?: "pill" | "group";
  dotClassName?: string;
  ariaLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={mixed ? "mixed" : pressed}
      disabled={disabled}
      onClick={onClick}
      className={chipClass(pressed, mixed, disabled, shape)}
    >
      {dotClassName ? (
        <span
          className={`size-2 shrink-0 rounded-full ${dotClassName} ${pressed && !mixed ? "ring-2 ring-white/40" : ""}`}
          aria-hidden
        />
      ) : null}
      {label}
    </button>
  );
}

function FilterSection({
  title,
  hint,
  stacked = false,
  children,
}: {
  title: string;
  hint?: string;
  stacked?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-medium tracking-wide text-stone-500">
          {title}
        </h2>
        {hint ? <p className="text-xs text-stone-400">{hint}</p> : null}
      </div>
      <div className={stacked ? "flex flex-col gap-2" : "flex flex-wrap gap-2"}>
        {children}
      </div>
    </section>
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
  const allStaffIds = staff.map((person) => person.id);
  const allStaffSelected =
    staff.length > 0 && filter.staffIds.length === staff.length;
  const allStatusesSelected =
    filter.statuses.length === CALENDAR_STATUSES.length;
  const isDefault = allStaffSelected && allStatusesSelected;

  function setStaffIds(staffIds: string[]) {
    onChange({ ...filter, staffIds });
  }

  function setStatuses(statuses: CalendarStatus[]) {
    onChange({ ...filter, statuses });
  }

  function reset() {
    onChange({
      staffIds: allStaffIds,
      statuses: [...CALENDAR_STATUSES],
    });
  }

  const staffHint =
    staff.length === 0
      ? undefined
      : `${filter.staffIds.length}/${staff.length}`;
  const statusHint = `${filter.statuses.length}/${CALENDAR_STATUSES.length}`;

  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-stone-900">篩選月曆</p>
          <p className="mt-0.5 text-xs text-stone-500">
            點選即可顯示或隱藏。點選職位可一次選取該組全部員工。
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={isDefault}
          className="shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 disabled:invisible"
        >
          重設
        </button>
      </div>

      <FilterSection title="員工" hint={staffHint} stacked>
        {STAFF_KINDS.map((kind) => {
          const ofKind = staff.filter((person) => person.staff_kind === kind);
          if (ofKind.length === 0) {
            return null;
          }
          return (
            <StaffKindGroup
              key={kind}
              kind={kind}
              people={ofKind}
              selectedIds={filter.staffIds}
              allStaff={staff}
              onToggleKind={() =>
                setStaffIds(toggleStaffKind(staff, filter.staffIds, kind))
              }
              onTogglePerson={(id) =>
                setStaffIds(toggleId(filter.staffIds, id, allStaffIds))
              }
            />
          );
        })}
        {staff.length === 0 ? (
          <p className="text-sm text-stone-500">尚未有員工</p>
        ) : null}
      </FilterSection>

      {filter.staffIds.length === 0 && staff.length > 0 ? (
        <p className="text-xs text-amber-700">尚未選取員工，月曆將不會顯示任何時段。</p>
      ) : null}
      {filter.statuses.length === 0 ? (
        <p className="text-xs text-amber-700">尚未選取狀態，相關時段將會隱藏。</p>
      ) : null}

      <FilterSection title="狀態" hint={statusHint}>
        {CALENDAR_STATUSES.map((status) => (
          <Chip
            key={status}
            label={CALENDAR_STATUS_LABELS[status]}
            pressed={filter.statuses.includes(status)}
            dotClassName={STATUS_DOT[status]}
            onClick={() =>
              setStatuses(toggleId(filter.statuses, status, CALENDAR_STATUSES))
            }
          />
        ))}
      </FilterSection>
    </div>
  );
}

function StaffKindGroup({
  kind,
  people,
  selectedIds,
  allStaff,
  onToggleKind,
  onTogglePerson,
}: {
  kind: StaffKind;
  people: FilterStaff[];
  selectedIds: string[];
  allStaff: FilterStaff[];
  onToggleKind: () => void;
  onTogglePerson: (id: string) => void;
}) {
  const state = staffKindSelected(allStaff, selectedIds, kind);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Chip
        label={STAFF_KIND_LABELS[kind]}
        shape="group"
        pressed={state.checked || state.indeterminate}
        mixed={state.indeterminate}
        ariaLabel={
          state.checked
            ? `取消全部${STAFF_KIND_LABELS[kind]}`
            : `全選${STAFF_KIND_LABELS[kind]}`
        }
        onClick={onToggleKind}
      />
      {people.map((person) => (
        <Chip
          key={person.id}
          label={person.full_name}
          pressed={selectedIds.includes(person.id)}
          onClick={() => onTogglePerson(person.id)}
        />
      ))}
    </div>
  );
}
