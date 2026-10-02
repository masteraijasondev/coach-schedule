"use client";

import { createLessonAction } from "@/actions/lessons";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { SubmitButton } from "@/components/ui";
import { formatAvailabilityTime } from "@/lib/format";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

const TIME_STEP_MINUTES = 30;
const DEFAULT_START_MINUTE = 10 * 60;
const DEFAULT_END_MINUTE = 18 * 60;

export function EmployerDirectAssignForm({
  coaches,
  date,
  dateOptions,
  selectedCoachId,
  clearHref,
}: {
  coaches: { id: string; full_name: string }[];
  date: string;
  dateOptions?: string[];
  selectedCoachId?: string;
  clearHref?: string;
}) {
  const router = useRouter();
  const [coachId, setCoachId] = useState(
    selectedCoachId ?? coaches[0]?.id ?? "",
  );
  const [assignDate, setAssignDate] = useState(date);
  const [startMinute, setStartMinute] = useState(DEFAULT_START_MINUTE);
  const [endMinute, setEndMinute] = useState(DEFAULT_END_MINUTE);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    setAssignDate(date);
  }, [date]);

  useEffect(() => {
    if (selectedCoachId) {
      setCoachId(selectedCoachId);
      return;
    }
    if (!coaches.some((coach) => coach.id === coachId)) {
      setCoachId(coaches[0]?.id ?? "");
    }
  }, [selectedCoachId, coaches, coachId]);

  const coachName =
    coaches.find((coach) => coach.id === coachId)?.full_name ?? "員工";

  if (coaches.length === 0) {
    return null;
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((previous) => !previous)}
        className={[
          "inline-flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]",
          open
            ? "border-stone-800 bg-stone-800 text-white"
            : "border-dashed border-stone-300 bg-white text-stone-700 hover:border-stone-500",
        ].join(" ")}
      >
        <span aria-hidden className="text-base leading-none">
          {open ? "−" : "+"}
        </span>
        直接派更
      </button>
      {open ? (
        <div
          id={panelId}
          className="mt-3 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-3"
        >
          <p className="text-sm text-stone-500">
            僅在員工尚未申報可返工時使用。一般請先點選上方可返工時段派更。
          </p>
          <ActionForm
            action={createLessonAction}
            className="mt-3 grid gap-3"
            onSuccess={() => {
              if (clearHref) {
                router.replace(clearHref);
                return;
              }
              router.refresh();
            }}
          >
            <input type="hidden" name="direct" value="1" />
            {dateOptions && dateOptions.length > 0 ? (
              <label className="block space-y-1 text-sm">
                <span className="text-stone-700">日期</span>
                <select
                  name="date"
                  required
                  value={assignDate}
                  onChange={(event) => setAssignDate(event.currentTarget.value)}
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
                >
                  {dateOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="date" value={assignDate} />
            )}
            <label className="block space-y-1 text-sm">
              <span className="text-stone-700">員工</span>
              <select
                name="coach_id"
                required
                value={coachId}
                onChange={(event) => setCoachId(event.currentTarget.value)}
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
              >
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.full_name}
                  </option>
                ))}
              </select>
            </label>
            <AvailabilityTimeFields
              defaultStartMinute={DEFAULT_START_MINUTE}
              defaultEndMinute={DEFAULT_END_MINUTE}
              startValue={startMinute}
              endValue={endMinute}
              onStartChange={(next) => {
                setStartMinute(next);
                if (endMinute <= next) {
                  setEndMinute(Math.min(next + TIME_STEP_MINUTES, 1440));
                }
              }}
              onEndChange={(next) => {
                setEndMinute(next);
                if (startMinute >= next) {
                  setStartMinute(Math.max(next - TIME_STEP_MINUTES, 0));
                }
              }}
            />
            <SubmitButton>
              {`派更給 ${coachName}（${formatAvailabilityTime(startMinute)}–${formatAvailabilityTime(endMinute)}）`}
            </SubmitButton>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
