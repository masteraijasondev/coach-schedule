"use client";

import { confirmLessonPeriodsAction } from "@/actions/lessons";
import {
  createCheckInStudentAction,
  lookupSessionStudentsAction,
} from "@/actions/students";
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
  students = [],
  initialStudentId,
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
  students?: { id: string; name: string }[];
  initialStudentId?: string;
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
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialStudentId ? [initialStudentId] : [],
  );
  const [extraStudents, setExtraStudents] = useState<{ id: string; name: string }[]>([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [expectedNames, setExpectedNames] = useState<string[]>([]);
  const [expectedError, setExpectedError] = useState<string | null>(null);
  const [newStudentName, setNewStudentName] = useState("");
  const [studentMessage, setStudentMessage] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const payload = useMemo(() => JSON.stringify(periods), [periods]);
  const directory = useMemo(() => {
    const seen = new Set<string>();
    return [...students, ...extraStudents].filter((student) => {
      if (seen.has(student.id)) {
        return false;
      }
      seen.add(student.id);
      return true;
    });
  }, [students, extraStudents]);
  const workTypeName =
    workTypes.find((type) => type.id === lessonTypeId)?.name ?? "";
  const sessionKind = airtableSessionKind(workTypeName);
  const asksStudent = staffKind === "coach" && sessionKind != null;
  const studentIdsPayload = JSON.stringify(asksStudent ? selectedIds : []);

  useEffect(() => {
    if (!sessionKind) {
      return;
    }
    let cancelled = false;
    lookupSessionStudentsAction({
      date,
      startMinute: windowStart,
      endMinute: windowEnd,
      workTypeName,
    }).then((result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setExpectedNames([]);
        setExpectedError(result.error);
        return;
      }
      setExpectedNames(result.data);
      setExpectedError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionKind, date, windowStart, windowEnd, workTypeName]);

  function toggleStudent(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  async function addStudent(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      setStudentMessage("請輸入學生姓名");
      return;
    }
    const result = await createCheckInStudentAction(trimmed);
    if (!result.ok) {
      setStudentMessage(result.error);
      return;
    }
    setExtraStudents((current) => [...current, result.data]);
    setSelectedIds((current) =>
      current.includes(result.data.id) ? current : [...current, result.data.id],
    );
    setNewStudentName("");
    setStudentMessage(
      result.data.airtableSaved
        ? "已加入並寫入 Airtable"
        : "已加入本地名單，但未能寫入 Airtable",
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
    if (next.startMinute < windowStart || next.endMinute > windowEnd) {
      setAddError("簽到時段必須完全落在派更範圍內");
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
        只可加入已經結束的時段再確認；未加入及尚未結束的時段不計入薪資。
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
          <p className="text-stone-700">預計上課（Airtable）</p>
          {expectedError ? (
            <p className="text-xs text-amber-800">{expectedError}</p>
          ) : null}
          {expectedNames.length === 0 ? (
            <p className="text-xs text-stone-500">這個時段 Airtable 沒有對應學生</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {expectedNames.map((name) => {
                const match = directory.find(
                  (student) => student.name.trim().toLowerCase() === name.trim().toLowerCase(),
                );
                return (
                  <button
                    key={name}
                    type="button"
                    className={`rounded-full px-2 py-1 text-xs ${
                      match && selectedIds.includes(match.id)
                        ? "bg-stone-900 text-white"
                        : "bg-stone-100 text-stone-800"
                    }`}
                    onClick={() => {
                      if (match) {
                        toggleStudent(match.id);
                        return;
                      }
                      void addStudent(name);
                    }}
                  >
                    {name}
                    {match ? "" : " · 加入"}
                  </button>
                );
              })}
            </div>
          )}
          <label className="block space-y-1">
            <span className="text-stone-700">搜尋並記錄出席學生</span>
            <input
              value={studentQuery}
              onChange={(event) => setStudentQuery(event.target.value)}
              placeholder="學生姓名"
              className="w-full rounded-md border border-stone-300 bg-white px-2 py-2 text-sm"
            />
          </label>
          <div className="max-h-36 space-y-1 overflow-auto">
            {directory
              .filter((student) =>
                student.name.toLowerCase().includes(studentQuery.trim().toLowerCase()),
              )
              .slice(0, 8)
              .map((student) => (
                <button
                  key={student.id}
                  type="button"
                  className={`block w-full rounded-md px-2 py-1 text-left text-xs ${
                    selectedIds.includes(student.id)
                      ? "bg-stone-900 text-white"
                      : "bg-stone-50 text-stone-800"
                  }`}
                  onClick={() => toggleStudent(student.id)}
                >
                  {student.name}
                </button>
              ))}
          </div>
          {selectedIds.length > 0 ? (
            <p className="text-xs text-stone-600">
              已記錄：
              {directory
                .filter((student) => selectedIds.includes(student.id))
                .map((student) => student.name)
                .join("、")}
            </p>
          ) : null}
          <div className="flex gap-1">
            <input
              value={newStudentName}
              onChange={(event) => setNewStudentName(event.target.value)}
              placeholder="新學生姓名"
              className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-2 text-sm"
            />
            <button
              type="button"
              className="rounded-md border border-stone-300 px-2 py-2 text-xs"
              onClick={() => void addStudent(newStudentName)}
            >
              加入 Airtable
            </button>
          </div>
          {studentMessage ? (
            <p className="text-xs text-stone-600">{studentMessage}</p>
          ) : null}
        </div>
      ) : null}
      <AvailabilityTimeFields
        defaultStartMinute={initialStart}
        defaultEndMinute={defaultEnd(initialStart, pastEnd)}
        minMinute={windowStart}
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
        <input type="hidden" name="student_id" value={asksStudent ? selectedIds[0] ?? "" : ""} />
        <input type="hidden" name="student_ids" value={studentIdsPayload} />
        <SubmitButton
          disabled={
            periods.length === 0 ||
            workTypes.length === 0 ||
            (asksStudent && selectedIds.length === 0)
          }
        >
          {submitLabel}
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
