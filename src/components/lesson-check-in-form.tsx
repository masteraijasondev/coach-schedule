"use client";

import { confirmLessonPeriodsAction } from "@/actions/lessons";
import { searchAirtableStudentsAction } from "@/actions/students";
import { airtableSessionKind } from "@/lib/session-kind";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { SubmitButton } from "@/components/ui";
import { useServerNow } from "@/components/use-server-now";
import {
  pastCheckInEndMinute,
  periodsOverlap,
  type CheckInPeriod,
} from "@/lib/check-in";
import { TIMEZONE } from "@/lib/constants";
import { formatAvailabilityTime } from "@/lib/format";
import { formatInTimeZone } from "date-fns-tz";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const DEFAULT_DURATION_MINUTES = 60;
const TIME_STEP_MINUTES = 30;

function snapStart(windowStart: number, windowEnd: number): number {
  const snapped = Math.ceil(windowStart / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  return snapped < windowEnd ? snapped : windowStart;
}

function defaultEnd(windowStart: number, windowEnd: number): number {
  return Math.min(windowStart + DEFAULT_DURATION_MINUTES, windowEnd);
}

export function LessonCheckInForm(
  props: Omit<Parameters<typeof LessonCheckInFields>[0], "nowMs">,
) {
  const { nowMs, error, retry } = useServerNow();
  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-amber-800">{error}</p>
        <button
          type="button"
          className="min-h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-800 shadow-sm"
          onClick={retry}
        >
          再試一次
        </button>
      </div>
    );
  }
  if (nowMs == null) {
    return <p className="text-sm text-stone-500">正在核對公司時間…</p>;
  }
  return <LessonCheckInFields {...props} nowMs={nowMs} />;
}

function LessonCheckInFields({
  lessonId,
  date,
  windowStart,
  windowEnd,
  initialPeriods = [],
  submitLabel = "確認簽到",
  workTypes,
  initialLessonTypeId,
  staffKind = "coach",
  action = confirmLessonPeriodsAction,
  nowMs,
}: {
  lessonId: string;
  date: string;
  windowStart: number;
  windowEnd: number;
  initialPeriods?: CheckInPeriod[];
  submitLabel?: string;
  workTypes: { id: string; name: string }[];
  initialLessonTypeId?: string;
  staffKind?: "coach" | "operations";
  action?: typeof confirmLessonPeriodsAction;
  nowMs: number;
}) {
  const router = useRouter();
  const today = formatInTimeZone(nowMs, TIMEZONE, "yyyy-MM-dd");
  const nowMinute =
    Number(formatInTimeZone(nowMs, TIMEZONE, "H")) * 60 +
    Number(formatInTimeZone(nowMs, TIMEZONE, "m"));
  const pastEnd = pastCheckInEndMinute(
    date,
    windowStart,
    windowEnd,
    today,
    nowMinute,
  );
  const initialStart = snapStart(windowStart, pastEnd ?? windowEnd);
  const [draftStart, setDraftStart] = useState(initialStart);
  const [draftEnd, setDraftEnd] = useState(
    defaultEnd(initialStart, pastEnd ?? windowEnd),
  );
  const [periods, setPeriods] = useState<CheckInPeriod[]>(initialPeriods);
  const [lessonTypeId, setLessonTypeId] = useState(
    workTypes.some((type) => type.id === initialLessonTypeId)
      ? initialLessonTypeId ?? ""
      : workTypes[0]?.id ?? "",
  );
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [searchNames, setSearchNames] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const payload = useMemo(() => JSON.stringify(periods), [periods]);
  const workTypeName =
    workTypes.find((type) => type.id === lessonTypeId)?.name ?? "";
  const sessionKind = airtableSessionKind(workTypeName);
  const asksStudent = staffKind === "coach" && sessionKind != null;
  const studentNamesPayload = JSON.stringify(asksStudent ? selectedNames : []);

  useEffect(() => {
    if (!asksStudent) {
      return;
    }
    const query = studentQuery.trim();
    if (query.length < 1) {
      setSearchNames([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchNames([]);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchAirtableStudentsAction(query)
        .then((result) => {
          if (cancelled) {
            return;
          }
          if (!result.ok) {
            setSearchNames([]);
            setSearchError(result.error);
            return;
          }
          setSearchNames(result.data);
          setSearchError(null);
        })
        .catch((error: unknown) => {
          console.error("[LessonCheckInFields] student search", { error });
          if (cancelled) {
            return;
          }
          setSearchNames([]);
          setSearchError("無法搜尋 Airtable 學生");
        })
        .finally(() => {
          if (!cancelled) {
            setSearching(false);
          }
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [asksStudent, studentQuery]);

  function toggleStudent(name: string) {
    setSelectedNames((current) =>
      current.some((item) => item.toLowerCase() === name.toLowerCase())
        ? current.filter((item) => item.toLowerCase() !== name.toLowerCase())
        : [...current, name],
    );
  }

  if (pastEnd == null) {
    return (
      <p className="text-sm text-amber-800">只可簽到已經結束的時段</p>
    );
  }
  const latestPastEnd = pastEnd;

  function addPeriod() {
    const next = { startMinute: draftStart, endMinute: draftEnd };
    if (next.endMinute <= next.startMinute) {
      setAddError("結束時間必須晚於開始時間");
      return;
    }
    if (
      next.startMinute < 0 ||
      next.endMinute > 1440 ||
      next.startMinute > windowEnd ||
      next.endMinute < windowStart
    ) {
      setAddError("簽到時間需要覆蓋或緊貼原本派更");
      return;
    }
    if (next.endMinute > latestPastEnd) {
      setAddError("只可簽到已經結束的時段");
      return;
    }
    if (periods.some((period) => periodsOverlap(period, next))) {
      setAddError("簽到時段不可重疊");
      return;
    }
    setAddError(null);
    setPeriods(
      [...periods, next].sort((a, b) => a.startMinute - b.startMinute),
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] leading-snug text-amber-800">
        實際上下班可以早過或遲過派更，以 30 分鐘為單位。只可加入已經結束的時間；未加入的時間不計入薪資。
      </p>
      {workTypes.length === 0 ? (
        <p className="text-sm text-amber-800">尚未獲分配工作類型，請聯絡公司。</p>
      ) : (
        <label className="block space-y-1 text-sm">
          <span className="text-stone-700">實際工作</span>
          <select
            required
            value={lessonTypeId}
            onChange={(event) => setLessonTypeId(event.target.value)}
            className="w-full rounded-md border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900"
          >
            {workTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {asksStudent ? (
        <div className="space-y-2 text-sm">
          <label className="block space-y-1">
            <span className="text-stone-700">
              {sessionKind === "group"
                ? "學生（可揀多於一位，輸入姓名搜尋 Airtable）"
                : "學生（輸入姓名搜尋 Airtable）"}
            </span>
            <input
              value={studentQuery}
              onChange={(event) => setStudentQuery(event.target.value)}
              placeholder="輸入學生姓名"
              className="w-full rounded-md border border-stone-300 bg-white px-2 py-2 text-sm"
            />
          </label>
          {searchError ? (
            <p className="text-xs text-amber-800">{searchError}</p>
          ) : null}
          {searching ? (
            <p className="text-xs text-stone-500">搜尋中…</p>
          ) : null}
          {studentQuery.trim() && !searching && searchNames.length === 0 && !searchError ? (
            <p className="text-xs text-stone-500">沒有符合的學生</p>
          ) : null}
          <div className="max-h-36 space-y-1 overflow-auto">
            {searchNames.map((name) => (
              <button
                key={name}
                type="button"
                className={`block w-full rounded-md px-2 py-1 text-left text-xs ${
                  selectedNames.some((item) => item.toLowerCase() === name.toLowerCase())
                    ? "bg-stone-900 text-white"
                    : "bg-stone-50 text-stone-800"
                }`}
                onClick={() => toggleStudent(name)}
              >
                {name}
              </button>
            ))}
          </div>
          {selectedNames.length > 0 ? (
            <p className="text-xs text-stone-600">已記錄：{selectedNames.join("、")}</p>
          ) : null}
        </div>
      ) : null}
      <AvailabilityTimeFields
        defaultStartMinute={initialStart}
        defaultEndMinute={defaultEnd(initialStart, pastEnd)}
        minMinute={0}
        maxMinute={pastEnd}
        startName="check_in_start"
        endName="check_in_end"
        startValue={draftStart}
        endValue={draftEnd}
        onStartChange={setDraftStart}
        onEndChange={setDraftEnd}
      />
      <button
        type="button"
        className="min-h-11 w-full cursor-pointer rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-amber-950"
        onClick={addPeriod}
      >
        加入此時段
      </button>
      {addError ? (
        <p className="text-xs text-red-700" role="alert">
          {addError}
        </p>
      ) : null}
      {periods.length > 0 ? (
        <ul className="space-y-1">
          {periods.map((period) => (
            <li
              key={`${period.startMinute}-${period.endMinute}`}
              className="flex items-center justify-between gap-1 text-xs tabular-nums"
            >
              <span>
                {formatAvailabilityTime(period.startMinute)}–
                {formatAvailabilityTime(period.endMinute)}
              </span>
              <button
                type="button"
                className="min-h-11 cursor-pointer rounded-md px-2 text-red-700"
                onClick={() =>
                  setPeriods(
                    periods.filter(
                      (item) =>
                        item.startMinute !== period.startMinute ||
                        item.endMinute !== period.endMinute,
                    ),
                  )
                }
              >
                刪除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[10px] text-stone-500">尚未加入簽到時段</p>
      )}
      <ActionForm
        action={action}
        className="space-y-2"
        onSuccess={() => {
          router.refresh();
        }}
      >
        <input type="hidden" name="lesson_id" value={lessonId} />
        <input type="hidden" name="periods" value={payload} />
        <input type="hidden" name="lesson_type_id" value={lessonTypeId} />
        <input type="hidden" name="student_names" value={studentNamesPayload} />
        <SubmitButton
          disabled={
            periods.length === 0 ||
            workTypes.length === 0 ||
            (asksStudent && selectedNames.length === 0)
          }
        >
          {submitLabel}
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
