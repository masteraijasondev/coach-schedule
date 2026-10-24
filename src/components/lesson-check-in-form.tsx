"use client";

import { confirmLessonPeriodsAction } from "@/actions/lessons";
import { listAirtableStudentNamesAction } from "@/actions/students";
import { airtableSessionKind } from "@/lib/session-kind";
import { ActionForm } from "@/components/action-form";
import { AvailabilityTimeFields } from "@/components/availability-time-fields";
import { buttonTone } from "@/components/button-styles";
import { SubmitButton } from "@/components/ui";
import { useServerNow } from "@/components/use-server-now";
import {
  pastCheckInEndMinute,
  periodsOverlap,
  type CheckInPeriod,
} from "@/lib/check-in";
import { TIMEZONE } from "@/lib/constants";
import { expectedHourlyAmount } from "@/lib/expected-pay";
import { formatAvailabilityTime, formatMoney } from "@/lib/format";
import { formatInTimeZone } from "date-fns-tz";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const DEFAULT_DURATION_MINUTES = 60;
const TIME_STEP_MINUTES = 30;
const MAX_STUDENT_MATCHES = 8;

function matchingStudentNames(names: string[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const starts: string[] = [];
  const contains: string[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    if (lower.startsWith(needle)) {
      starts.push(name);
    } else if (lower.includes(needle)) {
      contains.push(name);
    }
  }
  return [...starts, ...contains].slice(0, MAX_STUDENT_MATCHES);
}

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
          className={buttonTone.secondary}
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
  initialStudentNames = [],
  submitLabel = "確認簽到",
  workTypes,
  initialLessonTypeId,
  staffKind = "coach",
  fallbackHourlyRate = null,
  action = confirmLessonPeriodsAction,
  nowMs,
}: {
  lessonId: string;
  date: string;
  windowStart: number;
  windowEnd: number;
  initialPeriods?: CheckInPeriod[];
  initialStudentNames?: string[];
  submitLabel?: string;
  workTypes: {
    id: string;
    name: string;
    registersStudent: boolean;
    payMode?: string;
    hourlyRate?: number | null;
  }[];
  fallbackHourlyRate?: number | null;
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
  const [periods, setPeriods] = useState<CheckInPeriod[]>(() =>
    initialPeriods.map((period) => ({
      ...period,
      lessonTypeId: period.lessonTypeId ?? initialLessonTypeId,
      studentNames: period.studentNames ?? initialStudentNames,
    })),
  );
  const [draftDirty, setDraftDirty] = useState(false);
  const [lessonTypeId, setLessonTypeId] = useState(
    workTypes.some((type) => type.id === initialLessonTypeId)
      ? initialLessonTypeId ?? ""
      : workTypes[0]?.id ?? "",
  );
  const [selectedNames, setSelectedNames] = useState<string[]>(initialStudentNames);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentDirectory, setStudentDirectory] = useState<string[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const registered = initialPeriods.length > 0;
  const [editing, setEditing] = useState(!registered);
  const payload = useMemo(() => JSON.stringify(periods), [periods]);
  const workTypeName =
    workTypes.find((type) => type.id === lessonTypeId)?.name ?? "";
  const sessionKind = airtableSessionKind(workTypeName);
  const asksStudent =
    staffKind === "coach" &&
    workTypes.find((type) => type.id === lessonTypeId)?.registersStudent === true;
  const studentNamesPayload = JSON.stringify(asksStudent ? selectedNames : []);
  const searchNames = useMemo(
    () => matchingStudentNames(studentDirectory ?? [], studentQuery),
    [studentDirectory, studentQuery],
  );

  const directoryLoading =
    asksStudent && studentDirectory === null && searchError === null;

  useEffect(() => {
    if (!asksStudent || studentDirectory) {
      return;
    }
    let cancelled = false;
    listAirtableStudentNamesAction()
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          setSearchError(result.error);
          return;
        }
        setStudentDirectory(result.data);
        setSearchError(null);
      })
      .catch((error: unknown) => {
        console.error("[LessonCheckInFields] student directory", { error });
        if (!cancelled) {
          setSearchError("無法搜尋 Airtable 學生");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [asksStudent, studentDirectory]);

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
    if (!lessonTypeId) {
      setAddError("請選擇實際工作類型");
      return;
    }
    if (asksStudent && selectedNames.length === 0) {
      setAddError("請選擇教了哪位學生");
      return;
    }
    setAddError(null);
    setDraftDirty(false);
    setPeriods(
      [
        ...periods,
        {
          ...next,
          lessonTypeId,
          studentNames: asksStudent ? [...selectedNames] : [],
          locked: true,
        },
      ].sort((a, b) => a.startMinute - b.startMinute),
    );
  }

  function resolvedPeriods():
    | { ok: true; periods: CheckInPeriod[] }
    | { ok: false; error: string } {
    const listed = periods.map((period) =>
      period.locked && period.lessonTypeId
        ? period
        : {
            ...period,
            lessonTypeId,
            studentNames: asksStudent ? [...selectedNames] : [],
          },
    );
    const duplicate = listed.some(
      (period) =>
        period.startMinute === draftStart && period.endMinute === draftEnd,
    );
    if (!draftDirty || duplicate) {
      return { ok: true, periods: listed };
    }
    const extra = {
      startMinute: draftStart,
      endMinute: draftEnd,
      lessonTypeId,
      studentNames: asksStudent ? [...selectedNames] : [],
      locked: true,
    };
    if (!lessonTypeId) {
      return { ok: false, error: "請選擇實際工作類型" };
    }
    if (extra.endMinute <= extra.startMinute) {
      return { ok: false, error: "結束時間必須晚於開始時間" };
    }
    if (
      extra.startMinute < 0 ||
      extra.endMinute > 1440 ||
      extra.startMinute > windowEnd ||
      extra.endMinute < windowStart
    ) {
      return { ok: false, error: "簽到時間需要覆蓋或緊貼原本派更" };
    }
    if (extra.endMinute > latestPastEnd) {
      return { ok: false, error: "只可簽到已經結束的時段" };
    }
    if (listed.some((period) => periodsOverlap(period, extra))) {
      return { ok: false, error: "簽到時段不可重疊" };
    }
    if (asksStudent && selectedNames.length === 0) {
      return { ok: false, error: "請選擇教了哪位學生" };
    }
    return {
      ok: true,
      periods: [...listed, extra].sort((a, b) => a.startMinute - b.startMinute),
    };
  }

  function startingLessonTypeId() {
    return workTypes.some((type) => type.id === initialLessonTypeId)
      ? initialLessonTypeId ?? ""
      : workTypes[0]?.id ?? "";
  }

  function checkInPayNote(): string {
    const built = resolvedPeriods();
    const rows = built.ok ? built.periods : periods;
    if (rows.length === 0) {
      return "請先加入時段。確認前不計入已確認薪金。";
    }
    let hourlyTotal = 0;
    let hourlyKnown = true;
    let usedFallback = false;
    let hasHourly = false;
    let hasStudent = false;
    let hasLater = false;
    for (const row of rows) {
      const typeId = row.lessonTypeId || lessonTypeId;
      const type = workTypes.find((item) => item.id === typeId);
      const minutes = row.endMinute - row.startMinute;
      const mode = type?.payMode;
      const studentPay =
        mode === "per_student" ||
        (mode == null && type?.registersStudent === true && staffKind === "coach");
      if (studentPay) {
        hasStudent = true;
        continue;
      }
      if (mode === "per_head" || mode === "per_session") {
        hasLater = true;
        continue;
      }
      hasHourly = true;
      const specific = type?.hourlyRate;
      const rate = specific ?? fallbackHourlyRate;
      if (rate == null || minutes <= 0) {
        hourlyKnown = false;
        continue;
      }
      if (specific == null) {
        usedFallback = true;
      }
      hourlyTotal += expectedHourlyAmount(minutes, rate);
    }
    const parts: string[] = [];
    if (hasHourly && hourlyKnown) {
      parts.push(
        `${usedFallback ? "按預設時薪估計 " : ""}${formatMoney(hourlyTotal)}`,
      );
    } else if (hasHourly && !hourlyKnown) {
      parts.push("時薪尚未設定，現在不計入");
    }
    if (hasStudent) {
      parts.push("學生分成於簽到後計入，現在不計入");
    }
    if (hasLater) {
      parts.push("人頭或堂數於簽到後計入，現在不計入");
    }
    if (parts.length === 0) {
      return "確認前不計入已確認薪金。";
    }
    return `確認簽到後：${parts.join("。")}。`;
  }

  function cancelEdit() {
    setDraftStart(initialStart);
    setDraftEnd(defaultEnd(initialStart, pastEnd ?? windowEnd));
    setDraftDirty(false);
    setPeriods(
      initialPeriods.map((period) => ({
        ...period,
        lessonTypeId: period.lessonTypeId ?? initialLessonTypeId,
        studentNames: period.studentNames ?? initialStudentNames,
      })),
    );
    setLessonTypeId(startingLessonTypeId());
    setSelectedNames(initialStudentNames);
    setStudentQuery("");
    setSearchError(null);
    setAddError(null);
    setEditing(false);
  }

  if (registered && !editing) {
    return (
      <button
        type="button"
        className="min-h-11 w-full cursor-pointer rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-800"
        onClick={() => setEditing(true)}
      >
        修改
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-snug text-amber-800">
        實際上下班可以早或遲於派更，以 30 分鐘為單位。只可簽到已經結束的時間；未完成簽到時段不計入薪資。
      </p>
      {workTypes.length === 0 ? (
        <p className="text-sm text-amber-800">尚未獲分配工作類型，請聯絡公司。</p>
      ) : (
        <label className="block space-y-1 text-sm">
          <select
            required
            value={lessonTypeId}
            onChange={(event) => {
              const nextTypeId = event.target.value;
              setLessonTypeId(nextTypeId);
              setPeriods((current) =>
                current.map((period) =>
                  period.locked
                    ? period
                    : {
                        ...period,
                        lessonTypeId: nextTypeId,
                        studentNames: [],
                      },
                ),
              );
            }}
            className="w-full rounded-md border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900"
          >
            <option value="" disabled>
              請選擇實際工作類型
            </option>
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
                ? "學生（可多於一位學生）"
                : "學生"}
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
          {directoryLoading ? (
            <p className="text-xs text-stone-500">載入學生名單…</p>
          ) : null}
          {studentQuery.trim() &&
          !directoryLoading &&
          studentDirectory &&
          searchNames.length === 0 &&
          !searchError ? (
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
            <p className="text-xs text-stone-600">學生：{selectedNames.join("、")}</p>
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
        onStartChange={(minute) => {
          setDraftStart(minute);
          setDraftDirty(true);
        }}
        onEndChange={(minute) => {
          setDraftEnd(minute);
          setDraftDirty(true);
        }}
      />
      <button
        type="button"
        className={`${buttonTone.secondary} min-h-11 w-full`}
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
                {[
                  `${formatAvailabilityTime(period.startMinute)}–${formatAvailabilityTime(period.endMinute)}`,
                  workTypes.find((type) => type.id === period.lessonTypeId)?.name,
                  (period.studentNames ?? []).join("、"),
                ]
                  .filter(Boolean)
                  .join(" ")}
              </span>
              <button
                type="button"
                className="min-h-11 cursor-pointer rounded-md px-2 text-stone-600"
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
                移除
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
        beforeSubmit={(formData) => {
          const built = resolvedPeriods();
          if (!built.ok) {
            setAddError(built.error);
            return built;
          }
          setAddError(null);
          formData.set(
            "periods",
            JSON.stringify(
              built.periods.map((period) => ({
                startMinute: period.startMinute,
                endMinute: period.endMinute,
                lessonTypeId: period.lessonTypeId,
                studentNames: period.studentNames ?? [],
              })),
            ),
          );
          return null;
        }}
        onSuccess={() => {
          setEditing(false);
          router.refresh();
        }}
      >
        <input type="hidden" name="lesson_id" value={lessonId} />
        <input type="hidden" name="periods" value={payload} />
        <input type="hidden" name="lesson_type_id" value={lessonTypeId} />
        <input type="hidden" name="student_names" value={studentNamesPayload} />
        <p className="text-sm text-[#2C2C2C]">{checkInPayNote()}</p>
        <div className="flex gap-2">
          {registered ? (
            <button
              type="button"
              className={`${buttonTone.secondary} min-h-11 flex-1`}
              onClick={cancelEdit}
            >
              取消
            </button>
          ) : null}
          <SubmitButton
            variant={registered ? "confirmed" : "checkIn"}
            disabled={
              periods.length === 0 ||
              workTypes.length === 0 ||
              (asksStudent && selectedNames.length === 0)
            }
          >
            {submitLabel}
          </SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
