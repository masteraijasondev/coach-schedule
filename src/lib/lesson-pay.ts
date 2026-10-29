import {
  appointmentFeesForCheckedInNames,
  lookupAirtableTuitions,
  lookupMiitSlotCatalog,
} from "@/lib/airtable-tuition";
import { payrollPeriodBoundsIso } from "@/lib/calendar";
import {
  quoteFeeRatioFromLedger,
  resolveMiitFeeLedger,
  type SlotWindow,
} from "@/lib/fee-ledger";
import { coachPayFromFeeRatio } from "@/lib/pt-rate";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PayMode } from "@/lib/types";

export type LessonPayQuote = {
  studentFeeHkd: number | null;
  earnedAmountHkd: number | null;
  source: "airtable";
};

export type QuotePtLessonPayResult =
  | { ok: true; quote: LessonPayQuote }
  | { ok: false; error: string };

/**
 * PT quote from current Airtable tuition × coach pay ratio.
 * Missing Airtable prices are omitted from the sum (same as check-in).
 */
export async function quotePtLessonPay(input: {
  studentNames: string[];
  payRatio: number;
}): Promise<QuotePtLessonPayResult> {
  const names = input.studentNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) {
    return { ok: false, error: "請選擇教了哪位學生" };
  }
  const ratio = Number(input.payRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return { ok: false, error: "尚未設定 Coach 分成比例" };
  }

  const tuitionResult = await lookupAirtableTuitions(names);
  if (tuitionResult.error) {
    console.error("[quotePtLessonPay] tuition", { error: tuitionResult.error });
    return { ok: false, error: "讀取學生學費失敗" };
  }

  let fee = 0;
  let pay = 0;
  for (const name of names) {
    const listed = tuitionResult.fees.get(name);
    if (listed != null) {
      fee += listed;
      pay += coachPayFromFeeRatio(listed, ratio);
    }
  }

  return {
    ok: true,
    quote: {
      studentFeeHkd: fee > 0 ? fee : null,
      earnedAmountHkd: fee > 0 ? pay : 0,
      source: "airtable",
    },
  };
}

export type QuoteMiitLessonPayResult =
  | { ok: true; quote: LessonPayQuote }
  | { ok: false; error: string };

export async function quoteMiitLessonPay(input: {
  slot: SlotWindow;
  studentNames: string[];
  payRatio: number;
  headRateFallback: number;
}): Promise<QuoteMiitLessonPayResult> {
  const names = input.studentNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) {
    return { ok: false, error: "請選擇教了哪位學生" };
  }
  const ratio = Number(input.payRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return { ok: false, error: "尚未設定 Coach 分成比例" };
  }

  const catalog = await lookupMiitSlotCatalog(input.slot);
  if (catalog.error) {
    console.error("[quoteMiitLessonPay] catalog", { error: catalog.error });
    return { ok: false, error: "讀取 MIIT 學費失敗" };
  }

  const appointmentFeesByName = appointmentFeesForCheckedInNames(
    catalog.entries,
    names,
  );
  const ledger = resolveMiitFeeLedger({
    studentNames: names,
    appointmentFeesByName,
    headRateFallback: input.headRateFallback,
  });
  if (!ledger.ok) {
    return { ok: false, error: ledger.error };
  }

  const quoted = quoteFeeRatioFromLedger(ledger.lines, ratio);
  return {
    ok: true,
    quote: {
      studentFeeHkd: quoted.studentFeeHkd,
      earnedAmountHkd: quoted.earnedAmountHkd,
      source: "airtable",
    },
  };
}

export type ApplyLessonPayResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: string };

/** Persist a quote onto a lesson row. */
export async function applyLessonPay(
  lessonId: string,
  quote: LessonPayQuote,
  options?: { dryRun?: boolean },
): Promise<ApplyLessonPayResult> {
  if (!lessonId) {
    return { ok: false, error: "找不到課堂" };
  }
  const admin = createAdminClient();
  const { data: current, error: readError } = await admin
    .from("lessons")
    .select("id, student_fee_hkd, earned_amount_hkd, status")
    .eq("id", lessonId)
    .maybeSingle();
  if (readError) {
    console.error("[applyLessonPay] read", { error: readError, lessonId });
    return { ok: false, error: "讀取課堂失敗" };
  }
  if (!current || current.status === "cancelled") {
    return { ok: false, error: "無法更新此課堂金額" };
  }

  const sameFee =
    (current.student_fee_hkd == null && quote.studentFeeHkd == null) ||
    Number(current.student_fee_hkd) === Number(quote.studentFeeHkd);
  const sameEarn =
    (current.earned_amount_hkd == null && quote.earnedAmountHkd == null) ||
    Number(current.earned_amount_hkd) === Number(quote.earnedAmountHkd);
  if (sameFee && sameEarn) {
    return { ok: true, changed: false };
  }
  if (options?.dryRun) {
    return { ok: true, changed: true };
  }

  const { error } = await admin
    .from("lessons")
    .update({
      student_fee_hkd: quote.studentFeeHkd,
      earned_amount_hkd: quote.earnedAmountHkd,
    })
    .eq("id", lessonId);
  if (error) {
    console.error("[applyLessonPay] update", { error, lessonId });
    return { ok: false, error: "更新金額失敗" };
  }
  return { ok: true, changed: true };
}

export type ResyncLessonPayScope = {
  lessonId?: string;
  coachId?: string;
  /** Payroll period YYYY-MM (11th → 10th). */
  period?: string;
  dryRun?: boolean;
  /**
   * When true, skip lessons that already have a coach_student_rates row
   * for any linked student (treated as employer-set defaults).
   */
  respectManual?: boolean;
};

export type ResyncLessonPayReport = {
  updated: number;
  unchanged: number;
  skipped: number;
  error: string | null;
};

type LessonRow = {
  id: string;
  coach_id: string | null;
  status: string;
  lesson_type_id: string;
  student_fee_hkd: number | null;
  earned_amount_hkd: number | null;
};

function moneyEq(
  left: number | null | undefined,
  right: number | null | undefined,
): boolean {
  if (left == null && right == null) {
    return true;
  }
  if (left == null || right == null) {
    return false;
  }
  return Number(left) === Number(right);
}

/**
 * Default entry: re-quote completed PT lessons from Airtable and write back.
 * Requires lessonId, or coachId+period, or period alone.
 */
export async function resyncLessonPayFromAirtable(
  scope: ResyncLessonPayScope,
): Promise<ResyncLessonPayReport> {
  const report: ResyncLessonPayReport = {
    updated: 0,
    unchanged: 0,
    skipped: 0,
    error: null,
  };

  if (!scope.lessonId && !scope.period) {
    return { ...report, error: "請指定課堂或結算期" };
  }

  const admin = createAdminClient();
  let lessons: LessonRow[] = [];

  if (scope.lessonId) {
    const { data, error } = await admin
      .from("lessons")
      .select(
        "id, coach_id, status, lesson_type_id, student_fee_hkd, earned_amount_hkd",
      )
      .eq("id", scope.lessonId)
      .maybeSingle();
    if (error) {
      console.error("[resyncLessonPayFromAirtable] lesson", { error });
      return { ...report, error: "讀取課堂失敗" };
    }
    if (data) {
      lessons = [data];
    }
  } else if (scope.period) {
    if (!/^\d{4}-\d{2}$/.test(scope.period)) {
      return { ...report, error: "結算期無效" };
    }
    const { start, end } = payrollPeriodBoundsIso(scope.period);
    let query = admin
      .from("lessons")
      .select(
        "id, coach_id, status, lesson_type_id, student_fee_hkd, earned_amount_hkd",
      )
      .eq("status", "completed")
      .gte("starts_at", start)
      .lt("starts_at", end);
    if (scope.coachId) {
      query = query.eq("coach_id", scope.coachId);
    }
    const { data, error } = await query;
    if (error) {
      console.error("[resyncLessonPayFromAirtable] period", { error });
      return { ...report, error: "讀取課堂失敗" };
    }
    lessons = data ?? [];
  }

  if (lessons.length === 0) {
    return report;
  }

  const typeIds = [...new Set(lessons.map((lesson) => lesson.lesson_type_id))];
  const coachIds = [
    ...new Set(
      lessons
        .map((lesson) => lesson.coach_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const lessonIds = lessons.map((lesson) => lesson.id);

  const [typesResult, profilesResult, linksResult] = await Promise.all([
    admin.from("lesson_types").select("id, pay_mode").in("id", typeIds),
    coachIds.length
      ? admin.from("profiles").select("id, pay_ratio").in("id", coachIds)
      : Promise.resolve({ data: [] as { id: string; pay_ratio: number | null }[], error: null }),
    admin
      .from("lesson_students")
      .select("lesson_id, student_id, students(name)")
      .in("lesson_id", lessonIds),
  ]);

  if (typesResult.error) {
    console.error("[resyncLessonPayFromAirtable] types", {
      error: typesResult.error,
    });
    return { ...report, error: "讀取工作類型失敗" };
  }
  if (profilesResult.error) {
    console.error("[resyncLessonPayFromAirtable] profiles", {
      error: profilesResult.error,
    });
    return { ...report, error: "讀取分成比例失敗" };
  }
  if (linksResult.error) {
    console.error("[resyncLessonPayFromAirtable] students", {
      error: linksResult.error,
    });
    return { ...report, error: "讀取學生失敗" };
  }

  const payModeByType = new Map(
    (typesResult.data ?? []).map((row) => [row.id, row.pay_mode as PayMode]),
  );
  const ratioByCoach = new Map(
    (profilesResult.data ?? []).map((row) => [row.id, row.pay_ratio]),
  );

  const namesByLesson = new Map<string, string[]>();
  const studentIdsByLesson = new Map<string, string[]>();
  for (const link of linksResult.data ?? []) {
    const students = link.students as
      | { name: string }
      | { name: string }[]
      | null;
    const name = Array.isArray(students)
      ? students[0]?.name
      : students?.name;
    if (name?.trim()) {
      const list = namesByLesson.get(link.lesson_id) ?? [];
      list.push(name.trim());
      namesByLesson.set(link.lesson_id, list);
    }
    if (link.student_id) {
      const ids = studentIdsByLesson.get(link.lesson_id) ?? [];
      ids.push(link.student_id);
      studentIdsByLesson.set(link.lesson_id, ids);
    }
  }

  let manualPairs: Set<string> | null = null;
  if (scope.respectManual && coachIds.length > 0) {
    const allStudentIds = [
      ...new Set(
        [...studentIdsByLesson.values()].flat(),
      ),
    ];
    if (allStudentIds.length > 0) {
      const { data: rates, error: ratesError } = await admin
        .from("coach_student_rates")
        .select("coach_id, student_id")
        .in("coach_id", coachIds)
        .in("student_id", allStudentIds);
      if (ratesError) {
        console.error("[resyncLessonPayFromAirtable] manual rates", {
          error: ratesError,
        });
        return { ...report, error: "讀取手動費率失敗" };
      }
      manualPairs = new Set(
        (rates ?? []).map((row) => `${row.coach_id}:${row.student_id}`),
      );
    }
  }

  const allNames = [
    ...new Set([...namesByLesson.values()].flat()),
  ];
  if (allNames.length > 0) {
    // Warm Airtable index once before per-lesson quotes.
    await lookupAirtableTuitions(allNames);
  }

  for (const lesson of lessons) {
    if (lesson.status !== "completed") {
      report.skipped += 1;
      continue;
    }
    if (payModeByType.get(lesson.lesson_type_id) !== "per_student") {
      report.skipped += 1;
      continue;
    }
    if (!lesson.coach_id) {
      report.skipped += 1;
      continue;
    }
    const names = namesByLesson.get(lesson.id) ?? [];
    if (names.length === 0) {
      report.skipped += 1;
      continue;
    }
    if (manualPairs) {
      const studentIds = studentIdsByLesson.get(lesson.id) ?? [];
      const isManual = studentIds.some((studentId) =>
        manualPairs!.has(`${lesson.coach_id}:${studentId}`),
      );
      if (isManual) {
        report.skipped += 1;
        continue;
      }
    }

    const ratio = Number(ratioByCoach.get(lesson.coach_id));
    const quoted = await quotePtLessonPay({ studentNames: names, payRatio: ratio });
    if (!quoted.ok) {
      report.skipped += 1;
      continue;
    }
    if (quoted.quote.studentFeeHkd == null) {
      // No Airtable price — leave existing snapshot alone.
      report.skipped += 1;
      continue;
    }

    if (
      moneyEq(lesson.student_fee_hkd, quoted.quote.studentFeeHkd) &&
      moneyEq(lesson.earned_amount_hkd, quoted.quote.earnedAmountHkd)
    ) {
      report.unchanged += 1;
      continue;
    }

    const applied = await applyLessonPay(lesson.id, quoted.quote, {
      dryRun: scope.dryRun,
    });
    if (!applied.ok) {
      return { ...report, error: applied.error };
    }
    if (applied.changed) {
      report.updated += 1;
    } else {
      report.unchanged += 1;
    }
  }

  return report;
}
