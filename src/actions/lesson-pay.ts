"use server";

import { revalidatePath } from "next/cache";
import { requireEmployer } from "@/lib/auth";
import {
  resyncLessonPayFromAirtable,
  type ResyncLessonPayReport,
} from "@/lib/lesson-pay";
import type { ActionResult } from "@/lib/types";

function revalidatePay() {
  revalidatePath("/employer/salary");
  revalidatePath("/coach/salary");
  revalidatePath("/employer/lessons");
}

export async function resyncAirtableLessonPayAction(input: {
  coachId?: string;
  period?: string;
  lessonId?: string;
  respectManual?: boolean;
}): Promise<ActionResult<ResyncLessonPayReport>> {
  try {
    await requireEmployer();
    const report = await resyncLessonPayFromAirtable({
      coachId: input.coachId,
      period: input.period,
      lessonId: input.lessonId,
      respectManual: input.respectManual ?? false,
    });
    if (report.error) {
      return { ok: false, error: report.error };
    }
    if (report.updated > 0) {
      revalidatePay();
    }
    return { ok: true, data: report };
  } catch (error) {
    console.error("[resyncAirtableLessonPayAction]", { error });
    return { ok: false, error: "跟 Airtable 重算失敗" };
  }
}
