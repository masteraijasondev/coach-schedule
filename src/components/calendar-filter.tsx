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
import { buttonTone } from "@/components/button-styles";
import type { ReactNode } from "react";

const STATUS_TONE: Record<
  CalendarStatus,
  { swatch: string; tick: string; selected: string }
> = {
  available: {
    swatch: "bg-amber-400",
    tick: "text-amber-950",
    selected: "border-amber-700 bg-amber-100 text-amber-950",
  },
  assigned: {
    swatch: "bg-emerald-500",
    tick: "text-white",
    selected: "border-emerald-800 bg-emerald-100 text-emerald-950",
  },
  leave: {
    swatch: "bg-stone-500",
    tick: "text-white",
    selected: "border-stone-500 bg-stone-200 text-stone-900",
  },
  checked_in: {
    swatch: "bg-sky-500",
    tick: "text-white",
    selected: "border-sky-800 bg-sky-100 text-sky-950",
  },
  released: {
    swatch: "bg-stone-400",
    tick: "text-stone-900",
    selected: "border-stone-400 bg-stone-100 text-stone-800",
  },
};

function FilterSection({
  title,
  hint,
  action,
  stacked = false,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  stacked?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-[#2C2C2C]">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {action}
          {hint ? <p className="text-xs font-semibold text-[#525252]">{hint}</p> : null}
        </div>
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
            點選即可顯示或隱藏。員工按組別區分，狀態以顏色及勾號表示。
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={isDefault}
          className={`${buttonTone.secondary} shrink-0 disabled:invisible`}
        >
          重設
        </button>
      </div>

      <FilterSection title="員工" hint={staffHint}>
        {staff.length === 0 ? (
          <p className="text-sm text-[#525252]">尚未有員工</p>
        ) : (
          <div className="grid w-full gap-3 sm:grid-cols-2">
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
          </div>
        )}
      </FilterSection>

      {filter.staffIds.length === 0 && staff.length > 0 ? (
        <p className="text-xs text-amber-700">尚未選取員工，月曆將不會顯示任何時段。</p>
      ) : null}
      {filter.statuses.length === 0 ? (
        <p className="text-xs text-amber-700">尚未選取狀態，相關時段將會隱藏。</p>
      ) : null}

      <FilterSection
        title="狀態"
        hint={statusHint}
        action={
          <button
            type="button"
            aria-label={allStatusesSelected ? "取消全選狀態" : "全選狀態"}
            aria-pressed={allStatusesSelected}
            onClick={() =>
              setStatuses(allStatusesSelected ? [] : [...CALENDAR_STATUSES])
            }
            className={`${buttonTone.secondary} shrink-0 whitespace-nowrap`}
          >
            {allStatusesSelected ? "取消全選" : "全選"}
          </button>
        }
      >
        {CALENDAR_STATUSES.map((status) => {
          const selected = filter.statuses.includes(status);
          const tone = STATUS_TONE[status];
          return (
            <button
              key={status}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                setStatuses(toggleId(filter.statuses, status, CALENDAR_STATUSES))
              }
              className={[
                "inline-flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]",
                selected
                  ? tone.selected
                  : "border-[#E6DDD2] bg-white text-[#525252] hover:border-[#C4B8AE]",
              ].join(" ")}
            >
              <span
                aria-hidden
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm ${tone.swatch} ${selected ? "" : "opacity-45"}`}
              >
                {selected ? <SelectedTick className={tone.tick} /> : null}
              </span>
              {CALENDAR_STATUS_LABELS[status]}
            </button>
          );
        })}
      </FilterSection>
    </div>
  );
}

function SelectedTick({ className }: { className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`h-3 w-3 ${className}`}>
      <path
        d="M3.2 8.3 6.4 11.4 12.8 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const GROUP_BOX: Record<StaffKind, string> = {
  operations: "border-[#D4CFC8] bg-[#F7F6F4]",
  coach: "border-[#F6C9A8] bg-[#FFF8F4]",
};

const PERSON_BOXES = [
  "bg-indigo-700",
  "bg-violet-700",
  "bg-teal-700",
  "bg-fuchsia-800",
  "bg-blue-800",
  "bg-cyan-800",
] as const;

function personMark(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
  }
  return name.trim().slice(0, 1).toUpperCase();
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
  const label = STAFF_KIND_LABELS[kind];
  return (
    <section className={`min-w-0 rounded-lg border bg-white p-3 ${GROUP_BOX[kind]}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[#2C2C2C]">{label}</h3>
        <button
          type="button"
          aria-label={state.checked ? `取消全選${label}` : `全選${label}`}
          aria-pressed={state.checked ? true : state.indeterminate ? "mixed" : false}
          onClick={onToggleKind}
          className={`${buttonTone.secondary} shrink-0 whitespace-nowrap`}
        >
          {state.checked ? "取消全選" : "全選"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {people.map((person) => {
          const selected = selectedIds.includes(person.id);
          const boxIndex = Math.max(
            0,
            allStaff.findIndex((item) => item.id === person.id),
          );
          return (
            <button
              key={person.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onTogglePerson(person.id)}
              className={[
                "inline-flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]",
                selected
                  ? "border-[#C2410C] bg-[#FFF6F0] text-[#2C2C2C]"
                  : "border-[#E6DDD2] bg-white text-[#525252] hover:border-[#C2410C]",
              ].join(" ")}
            >
              <span
                aria-hidden
                className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-sm px-1 text-[10px] font-bold text-white ${PERSON_BOXES[boxIndex % PERSON_BOXES.length]} ${selected ? "" : "opacity-45"}`}
              >
                {personMark(person.full_name)}
              </span>
              {person.full_name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
