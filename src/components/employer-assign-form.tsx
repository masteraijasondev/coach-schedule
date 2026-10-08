"use client";

import { releaseAvailabilityAction } from "@/actions/availability";
import { createLessonAction } from "@/actions/lessons";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { SubmitButton } from "@/components/ui";
import { formatExpectedPay } from "@/components/expected-pay-summary";
import { payrollPeriodForDate, payrollPeriodLabel } from "@/lib/calendar";
import {
  expectedHourlyAmount,
  periodPayTotals,
  type PayShift,
} from "@/lib/expected-pay";
import { formatAvailabilityTime, formatMoney } from "@/lib/format";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const TIME_STEP_MINUTES = 30;

export function EmployerAssignForm({
  coachId,
  coachName,
  date,
  startMinute,
  slotEndMinute,
  clearHref,
  hourlyRate = null,
  payShifts = [],
}: {
  coachId: string;
  coachName: string;
  date: string;
  startMinute: number;
  slotEndMinute: number;
  clearHref: string;
  hourlyRate?: number | null;
  payShifts?: PayShift[];
}) {
  const router = useRouter();
  const [assignStart, setAssignStart] = useState(startMinute);
  const [assignEnd, setAssignEnd] = useState(slotEndMinute);
  const [releaseStart, setReleaseStart] = useState(startMinute);
  const [releaseEnd, setReleaseEnd] = useState(slotEndMinute);
  const [releaseRemainder, setReleaseRemainder] = useState(true);

  useEffect(() => {
    setAssignStart(startMinute);
    setAssignEnd(slotEndMinute);
    setReleaseStart(startMinute);
    setReleaseEnd(slotEndMinute);
    setReleaseRemainder(true);
  }, [startMinute, slotEndMinute]);

  const hasRemainder =
    assignStart > startMinute || assignEnd < slotEndMinute;
  const releasingAll =
    releaseStart === startMinute && releaseEnd === slotEndMinute;
  const period = payrollPeriodForDate(date);
  const totals = periodPayTotals(payShifts, hourlyRate ?? null, period);
  const draftMinutes = Math.max(0, assignEnd - assignStart);
  const draftPay =
    hourlyRate == null
      ? null
      : expectedHourlyAmount(draftMinutes, hourlyRate);
  const expectedAfterDraft =
    totals.expected == null || draftPay == null
      ? null
      : Math.round((totals.expected + draftPay) * 100) / 100;

  function goClear() {
    router.replace(clearHref);
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <p className="font-medium">為 {coachName} 派更</p>
      <p className="mt-1 text-sm tabular-nums text-stone-600">
        {date} · 可返工 {formatAvailabilityTime(startMinute)}–
        {formatAvailabilityTime(slotEndMinute)}
      </p>
      <p className="mt-1 text-sm text-stone-500">
        派更與暫無需要可各自選擇時段。預期薪金按時薪估計已派更、尚未簽到的時段。
      </p>
      <div className="mt-3 rounded-md border border-stone-200 bg-white p-3 text-sm">
        <p className="font-medium text-stone-800">
          {payrollPeriodLabel(period)} 估計
        </p>
        <p className="mt-1">已確認薪金：{formatMoney(totals.confirmed)}</p>
        <p>預期薪金（已派更）：{formatExpectedPay(totals.expected)}</p>
        <p>今次時段估計：{formatExpectedPay(draftPay)}</p>
        <p>計入今次後預期：{formatExpectedPay(expectedAfterDraft)}</p>
      </div>
      <div className="mt-3 grid gap-4">
        <ActionForm
          action={createLessonAction}
          className="grid gap-3 rounded-md border border-stone-200 bg-white p-3"
          onSuccess={goClear}
        >
          <p className="text-sm font-medium text-stone-800">派更時段</p>
          <input type="hidden" name="coach_id" value={coachId} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="slot_start_minute" value={startMinute} />
          <input type="hidden" name="slot_end_minute" value={slotEndMinute} />
          <AvailabilityTimeFields
            defaultStartMinute={startMinute}
            defaultEndMinute={slotEndMinute}
            minMinute={startMinute}
            maxMinute={slotEndMinute}
            startValue={assignStart}
            endValue={assignEnd}
            onStartChange={(next) => {
              setAssignStart(next);
              if (assignEnd <= next) {
                setAssignEnd(Math.min(next + TIME_STEP_MINUTES, slotEndMinute));
              }
            }}
            onEndChange={(next) => {
              setAssignEnd(next);
              if (assignStart >= next) {
                setAssignStart(Math.max(next - TIME_STEP_MINUTES, startMinute));
              }
            }}
          />
          {hasRemainder ? (
            <label className="flex items-start gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={releaseRemainder}
                onChange={(event) => setReleaseRemainder(event.target.checked)}
                className="mt-0.5 size-4 rounded border-stone-300"
              />
              <span>
                將其餘可返工時間標為暫無需要（
                {assignStart > startMinute
                  ? `${formatAvailabilityTime(startMinute)}–${formatAvailabilityTime(assignStart)}`
                  : null}
                {assignStart > startMinute && assignEnd < slotEndMinute
                  ? "、"
                  : null}
                {assignEnd < slotEndMinute
                  ? `${formatAvailabilityTime(assignEnd)}–${formatAvailabilityTime(slotEndMinute)}`
                  : null}
                ）
              </span>
            </label>
          ) : null}
          {hasRemainder && releaseRemainder ? (
            <input type="hidden" name="release_remainder" value="1" />
          ) : null}
          <SubmitButton>
            {`派更（${formatAvailabilityTime(assignStart)}–${formatAvailabilityTime(assignEnd)}）`}
          </SubmitButton>
        </ActionForm>
        <ActionForm
          action={releaseAvailabilityAction}
          className="grid gap-3 rounded-md border border-stone-200 bg-white p-3"
          onSuccess={goClear}
        >
          <p className="text-sm font-medium text-stone-800">暫無需要時段</p>
          <p className="text-sm text-stone-500">
            只會釋放下面選中的時間，其餘可返工時間維持待派更。
          </p>
          <input type="hidden" name="coach_id" value={coachId} />
          <input type="hidden" name="date" value={date} />
          <AvailabilityTimeFields
            defaultStartMinute={startMinute}
            defaultEndMinute={slotEndMinute}
            minMinute={startMinute}
            maxMinute={slotEndMinute}
            startValue={releaseStart}
            endValue={releaseEnd}
            onStartChange={(next) => {
              setReleaseStart(next);
              if (releaseEnd <= next) {
                setReleaseEnd(Math.min(next + TIME_STEP_MINUTES, slotEndMinute));
              }
            }}
            onEndChange={(next) => {
              setReleaseEnd(next);
              if (releaseStart >= next) {
                setReleaseStart(Math.max(next - TIME_STEP_MINUTES, startMinute));
              }
            }}
          />
          <SubmitButton variant="released" className="w-full min-w-0">
            {releasingAll
              ? `整段暫無需要`
              : `暫無需要（${formatAvailabilityTime(releaseStart)}–${formatAvailabilityTime(releaseEnd)}）`}
          </SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
