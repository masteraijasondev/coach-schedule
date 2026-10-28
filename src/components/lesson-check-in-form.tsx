"use client";

import { confirmLessonPeriodsAction } from "@/actions/lessons";
import { listAirtableStudentNamesAction } from "@/actions/students";
import { airtableSessionKind } from "@/lib/session-kind";
import { ActionForm } from "@/components/action-form";
import { Alert } from "@/components/alert";
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
import { formatAvailabilityTime } from "@/lib/format";
import { formatInTimeZone } from "date-fns-tz";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

const DEFAULT_DURATION_MINUTES = 60;
const TIME_STEP_MINUTES = 30;
const MAX_STUDENT_MATCHES = 8;

function RemoveButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#2C2C2C] hover:bg-stone-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C] active:bg-stone-300"
      aria-label={label}
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" aria-hidden className="size-3.5">
        <path
          d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

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
        <Alert variant="filled" severity="warning">
          {error}
        </Alert>
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
  initiallyEditing = false,
  workTypes,
  initialLessonTypeId,
  staffKind = "coach",
  fallbackHourlyRate = null,
  action = confirmLessonPeriodsAction,
  sideAction,
  nowMs,
}: {
  lessonId: string;
  date: string;
  windowStart: number;
  windowEnd: number;
  initialPeriods?: CheckInPeriod[];
  initialStudentNames?: string[];
  submitLabel?: string;
  initiallyEditing?: boolean;
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
  sideAction?: ReactNode;
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
  const [lessonTypeId, setLessonTypeId] = useState(
    workTypes.some((type) => type.id === initialLessonTypeId)
      ? initialLessonTypeId ?? ""
      : "",
  );
  const [selectedNames, setSelectedNames] = useState<string[]>(initialStudentNames);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentDirectory, setStudentDirectory] = useState<string[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [addingAnother, setAddingAnother] = useState(false);
  const [savedReceipt, setSavedReceipt] = useState<string | null>(null);
  const registered = initialPeriods.length > 0;
  const [editing, setEditing] = useState(initiallyEditing || !registered);
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
          setSearchError("無法載入學生名單");
          return;
        }
        setStudentDirectory(result.data);
        setSearchError(null);
      })
      .catch((error: unknown) => {
        console.error("[LessonCheckInFields] student directory", { error });
        if (!cancelled) {
          setSearchError("無法載入學生名單");
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
      <Alert variant="filled" severity="warning">
        只可簽到已經結束的時段
      </Alert>
    );
  }
  const latestPastEnd = pastEnd;
  const showDraft = periods.length === 0 || addingAnother;

  function revealAnother() {
    const nextStart = periods.reduce(
      (max, period) => Math.max(max, period.endMinute),
      0,
    );
    const start = Math.min(Math.max(nextStart, 0), latestPastEnd);
    setDraftStart(start);
    setDraftEnd(defaultEnd(start, latestPastEnd));
    setAddingAnother(true);
    setAddError(null);
  }

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
      setAddError("請選擇工作類型");
      return;
    }
    if (asksStudent && selectedNames.length === 0) {
      setAddError("請選擇教了哪位學生");
      return;
    }
    setAddError(null);
    setAddingAnother(false);
    const followingStart = next.endMinute;
    setDraftStart(followingStart);
    setDraftEnd(defaultEnd(followingStart, latestPastEnd));
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
    setSelectedNames([]);
    setStudentQuery("");
  }

  function draftPeriod():
    | { ok: true; period: CheckInPeriod }
    | { ok: false; error: string } {
    if (!lessonTypeId) {
      return { ok: false, error: "請選擇工作類型" };
    }
    if (draftEnd <= draftStart) {
      return { ok: false, error: "結束時間必須晚於開始時間" };
    }
    if (
      draftStart < 0 ||
      draftEnd > 1440 ||
      draftStart > windowEnd ||
      draftEnd < windowStart
    ) {
      return { ok: false, error: "簽到時間需要覆蓋或緊貼原本派更" };
    }
    if (draftEnd > latestPastEnd) {
      return { ok: false, error: "只可簽到已經結束的時段" };
    }
    if (asksStudent && selectedNames.length === 0) {
      return { ok: false, error: "請選擇教了哪位學生" };
    }
    return {
      ok: true,
      period: {
        startMinute: draftStart,
        endMinute: draftEnd,
        lessonTypeId,
        studentNames: asksStudent ? [...selectedNames] : [],
        locked: true,
      },
    };
  }

  function resolvedPeriods():
    | { ok: true; periods: CheckInPeriod[] }
    | { ok: false; error: string } {
    const listed = periods.map((period) => {
      if (period.locked && period.lessonTypeId) {
        return period;
      }
      const keepSavedStudents =
        periods.length > 1 && (period.studentNames?.length ?? 0) > 0;
      return {
        ...period,
        lessonTypeId: period.lessonTypeId || lessonTypeId,
        studentNames: keepSavedStudents
          ? period.studentNames
          : asksStudent
            ? [...selectedNames]
            : [],
      };
    });
    if (listed.length > 0) {
      if (listed.some((period) => !period.lessonTypeId)) {
        return { ok: false, error: "請選擇工作類型" };
      }
      const missingStudent = listed.some((period) => {
        const type = workTypes.find(
          (item) => item.id === period.lessonTypeId,
        );
        return (
          staffKind === "coach" &&
          type?.registersStudent === true &&
          (period.studentNames ?? []).length === 0
        );
      });
      if (missingStudent) {
        return { ok: false, error: "請選擇教了哪位學生" };
      }
      return { ok: true, periods: listed };
    }
    const draft = draftPeriod();
    if (!draft.ok) {
      return draft;
    }
    return { ok: true, periods: [draft.period] };
  }

  function startingLessonTypeId() {
    return workTypes.some((type) => type.id === initialLessonTypeId)
      ? initialLessonTypeId ?? ""
      : "";
  }

  function rowLabel(row: CheckInPeriod): string {
    return [
      `${formatAvailabilityTime(row.startMinute)}–${formatAvailabilityTime(row.endMinute)}`,
      workTypes.find((type) => type.id === row.lessonTypeId)?.name,
      (row.studentNames ?? []).join("、"),
    ]
      .filter(Boolean)
      .join(" ");
  }

  function cancelEdit() {
    setDraftStart(initialStart);
    setDraftEnd(defaultEnd(initialStart, pastEnd ?? windowEnd));
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

  const submission = resolvedPeriods();
  const receiptWhen = submission.ok
    ? submission.periods.map((period) => rowLabel(period)).join("；")
    : "";
  const savedLine = receiptWhen;
  const timeMin = 0;
  const timeMax = latestPastEnd;

  if (registered && !editing) {
    return (
      <div className="space-y-2">
        {savedReceipt ? (
          <Alert variant="filled" severity="success">
            已簽到。{savedReceipt}
          </Alert>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${buttonTone.secondary} min-w-0 flex-1`}
            onClick={() => setEditing(true)}
          >
            修改簽到
          </button>
          {sideAction ? (
            <div className="min-w-0 flex-1 has-[[role=alert]]:basis-full [&_button]:w-full">
              {sideAction}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {workTypes.length === 0 ? (
        <Alert variant="filled" severity="warning">
          尚未獲分配工作類型，請聯絡公司。
        </Alert>
      ) : (
        <label className="block space-y-1 text-sm">
          <span className="text-stone-700">工作類型</span>
          <select
            required
            value={lessonTypeId}
            onChange={(event) => {
              const nextTypeId = event.target.value;
              const nextAsksStudent =
                staffKind === "coach" &&
                workTypes.find((type) => type.id === nextTypeId)
                  ?.registersStudent === true;
              setLessonTypeId(nextTypeId);
              setAddError(null);
              if (!nextAsksStudent) {
                setSelectedNames([]);
                setStudentQuery("");
              }
              setPeriods((current) =>
                current.map((period) =>
                  period.locked
                    ? period
                    : {
                        ...period,
                        lessonTypeId: nextTypeId,
                        studentNames: nextAsksStudent
                          ? (period.studentNames ?? [])
                          : [],
                      },
                ),
              );
            }}
            className="w-full rounded-md border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]"
          >
            <option value="" disabled>
              請選擇工作類型
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
              {sessionKind === "group" || sessionKind === "miit"
                ? "學生（可多於一位學生）"
                : "學生"}
            </span>
            <input
              value={studentQuery}
              onChange={(event) => setStudentQuery(event.target.value)}
              placeholder="輸入學生姓名"
              className="w-full rounded-md border border-stone-300 bg-white px-2 py-2 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]"
            />
          </label>
          {searchError ? (
            <Alert variant="filled" severity="warning">
              {searchError}{" "}
              <button
                type="button"
                className="cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                onClick={() => {
                  setSearchError(null);
                  setStudentDirectory(null);
                }}
              >
                再試一次
              </button>
            </Alert>
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
                aria-pressed={selectedNames.some(
                  (item) => item.toLowerCase() === name.toLowerCase(),
                )}
                className={`block min-h-11 w-full rounded-md px-2 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C] ${
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
            <ul className="flex flex-wrap gap-1">
              {selectedNames.map((name) => (
                <li
                  key={name}
                  className="inline-flex items-center gap-1 rounded-md bg-stone-100 py-0.5 pr-0.5 pl-2 text-xs text-stone-800"
                >
                  <span>{name}</span>
                  <RemoveButton
                    label={`移除${name}`}
                    onClick={() => toggleStudent(name)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-2">
        {showDraft && periods.length > 0 ? (
          <p className="text-sm text-stone-700">另一時段</p>
        ) : null}
        {showDraft ? (
          <>
            <AvailabilityTimeFields
              defaultStartMinute={initialStart}
              defaultEndMinute={defaultEnd(initialStart, pastEnd)}
              minMinute={timeMin}
              maxMinute={timeMax}
              startName="check_in_start"
              endName="check_in_end"
              startValue={draftStart}
              endValue={draftEnd}
              onStartChange={(minute) => {
                setDraftStart(minute);
              }}
              onEndChange={(minute) => {
                setDraftEnd(minute);
              }}
            />
          </>
        ) : null}
      </div>
      {periods.length > 0 ? (
        <ul className="space-y-1">
          {periods.map((period) => {
            const label = rowLabel(period);
            return (
              <li
                key={`${period.startMinute}-${period.endMinute}`}
                className="flex items-center justify-between gap-1 text-base font-bold tabular-nums"
              >
                <span>{label}</span>
                <RemoveButton
                  label={`移除${label}`}
                  onClick={() =>
                    setPeriods(
                      periods.filter(
                        (item) =>
                          item.startMinute !== period.startMinute ||
                          item.endMinute !== period.endMinute,
                      ),
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : null}
      {addError ? (
        <Alert variant="filled" severity="error">{addError}</Alert>
      ) : null}
      <ActionForm
        action={action}
        className="space-y-2"
        successMessage={savedLine ? `已簽到。${savedLine}` : "已簽到"}
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
          setSavedReceipt(savedLine);
          setEditing(false);
          router.refresh();
        }}
      >
        <input type="hidden" name="lesson_id" value={lessonId} />
        <input type="hidden" name="periods" value={payload} />
        <input type="hidden" name="lesson_type_id" value={lessonTypeId} />
        <input type="hidden" name="student_names" value={studentNamesPayload} />
        <div className="flex gap-2">
          {registered ? (
            <button
              type="button"
              className={`${buttonTone.secondary} min-w-0 flex-1`}
              onClick={cancelEdit}
            >
              取消
            </button>
          ) : null}
          <SubmitButton
            variant={registered ? "confirmed" : "checkIn"}
            className="min-w-0 flex-1"
          >
            {submitLabel}
          </SubmitButton>
        </div>
        <button
          type="button"
          className="cursor-pointer self-start text-sm text-[#2C2C2C] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]"
          onClick={() => {
            if (periods.length > 0 && !addingAnother) {
              revealAnother();
              return;
            }
            addPeriod();
          }}
        >
          加入另一時段
        </button>
        {registered && sideAction ? (
          <div className="[&_button]:w-full">{sideAction}</div>
        ) : null}
      </ActionForm>
    </div>
  );
}
