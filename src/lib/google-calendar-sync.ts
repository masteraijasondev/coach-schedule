import { addDaysToYmd } from "@/lib/calendar";
import {
  deleteCalendarEvent,
  hongKongDateTime,
  hongKongMinuteRange,
  upsertCalendarEvent,
  type CalendarEventInput,
} from "@/lib/google-calendar";
import { createAdminClient } from "@/lib/supabase/admin";

type WebhookType = "INSERT" | "UPDATE" | "DELETE";

type LessonRecord = {
  id: string;
  coach_id: string | null;
  lesson_type_id: string | null;
  assigned_lesson_type_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  google_event_id: string | null;
};

type AvailabilityRecord = {
  id: string;
  coach_id: string;
  available_date: string;
  start_minute: number;
  end_minute: number;
  released: boolean | null;
  google_event_id: string | null;
};

type LeaveRecord = {
  id: string;
  coach_id: string;
  leave_date: string;
  start_minute: number | null;
  end_minute: number | null;
  kind: string | null;
  google_event_id: string | null;
};

const TRACKED_LESSON_FIELDS = [
  "coach_id",
  "lesson_type_id",
  "assigned_lesson_type_id",
  "starts_at",
  "ends_at",
  "status",
] as const;

const TRACKED_AVAILABILITY_FIELDS = [
  "coach_id",
  "available_date",
  "start_minute",
  "end_minute",
  "released",
] as const;

const TRACKED_LEAVE_FIELDS = [
  "coach_id",
  "leave_date",
  "start_minute",
  "end_minute",
  "kind",
] as const;

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function onlyMetaChanged(
  oldRecord: Record<string, unknown> | null,
  record: Record<string, unknown> | null,
  tracked: readonly string[],
): boolean {
  if (!oldRecord || !record) {
    return false;
  }
  return tracked.every((field) => sameValue(oldRecord[field], record[field]));
}

async function coachName(coachId: string | null | undefined): Promise<string> {
  if (!coachId) {
    return "未指定";
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", coachId)
    .maybeSingle();
  if (error) {
    console.error("[googleCalendarSync] coach", { error, coachId });
  }
  return data?.full_name?.trim() || "未指定";
}

async function lessonTypeName(
  lessonTypeId: string | null | undefined,
): Promise<string> {
  if (!lessonTypeId) {
    return "課堂";
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lesson_types")
    .select("name")
    .eq("id", lessonTypeId)
    .maybeSingle();
  if (error) {
    console.error("[googleCalendarSync] lesson type", { error, lessonTypeId });
  }
  return data?.name?.trim() || "課堂";
}

async function saveEventId(
  table: "lessons" | "staff_availabilities" | "staff_leaves",
  id: string,
  googleEventId: string | null,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from(table)
    .update({ google_event_id: googleEventId })
    .eq("id", id);
  if (error) {
    console.error("[googleCalendarSync] save event id", { error, table, id });
    throw new Error("更新 google_event_id 失敗");
  }
}

async function removeEvent(
  table: "lessons" | "staff_availabilities" | "staff_leaves",
  id: string,
  eventId: string | null | undefined,
): Promise<void> {
  if (eventId) {
    await deleteCalendarEvent(eventId);
  }
  if (eventId) {
    await saveEventId(table, id, null);
  }
}

function leaveLabel(kind: string | null | undefined): string {
  if (kind === "sick") {
    return "病假";
  }
  return "放假";
}

async function lessonEvent(record: LessonRecord): Promise<CalendarEventInput> {
  const [name, typeName] = await Promise.all([
    coachName(record.coach_id),
    lessonTypeName(record.assigned_lesson_type_id ?? record.lesson_type_id),
  ]);
  return {
    summary: `${name} · ${typeName}`,
    description: `lesson_id=${record.id} status=${record.status}`,
    colorId: record.status === "completed" ? "10" : "9",
    start: hongKongDateTime(record.starts_at),
    end: hongKongDateTime(record.ends_at),
  };
}

async function availabilityEvent(
  record: AvailabilityRecord,
): Promise<CalendarEventInput> {
  const name = await coachName(record.coach_id);
  const range = hongKongMinuteRange(
    record.available_date,
    record.start_minute,
    record.end_minute,
  );
  return {
    summary: `${name} · 可返工`,
    description: `availability_id=${record.id}`,
    colorId: "2",
    start: range.start,
    end: range.end,
  };
}

async function leaveEvent(record: LeaveRecord): Promise<CalendarEventInput> {
  const name = await coachName(record.coach_id);
  const label = leaveLabel(record.kind);
  const timed =
    record.start_minute != null &&
    record.end_minute != null &&
    Number.isFinite(record.start_minute) &&
    Number.isFinite(record.end_minute);

  if (timed) {
    const range = hongKongMinuteRange(
      record.leave_date,
      record.start_minute as number,
      record.end_minute as number,
    );
    return {
      summary: `${name} · ${label}`,
      description: `leave_id=${record.id} kind=${record.kind ?? "leave"}`,
      colorId: "4",
      start: range.start,
      end: range.end,
    };
  }

  return {
    summary: `${name} · ${label}`,
    description: `leave_id=${record.id} kind=${record.kind ?? "leave"}`,
    colorId: "4",
    start: { date: record.leave_date },
    end: { date: addDaysToYmd(record.leave_date, 1) },
  };
}

async function syncLesson(
  type: WebhookType,
  record: LessonRecord | null,
  oldRecord: LessonRecord | null,
): Promise<void> {
  if (
    type === "UPDATE" &&
    record?.google_event_id &&
    onlyMetaChanged(
      oldRecord as unknown as Record<string, unknown> | null,
      record as unknown as Record<string, unknown> | null,
      TRACKED_LESSON_FIELDS,
    )
  ) {
    return;
  }

  if (type === "DELETE") {
    const target = oldRecord;
    if (!target) {
      return;
    }
    if (target.google_event_id) {
      await deleteCalendarEvent(target.google_event_id);
    }
    return;
  }

  if (!record) {
    return;
  }

  if (record.status === "cancelled") {
    await removeEvent("lessons", record.id, record.google_event_id);
    return;
  }

  const eventId = await upsertCalendarEvent({
    eventId: record.google_event_id,
    event: await lessonEvent(record),
  });
  if (eventId !== record.google_event_id) {
    await saveEventId("lessons", record.id, eventId);
  }
}

async function syncAvailability(
  type: WebhookType,
  record: AvailabilityRecord | null,
  oldRecord: AvailabilityRecord | null,
): Promise<void> {
  if (
    type === "UPDATE" &&
    record?.google_event_id &&
    onlyMetaChanged(
      oldRecord as unknown as Record<string, unknown> | null,
      record as unknown as Record<string, unknown> | null,
      TRACKED_AVAILABILITY_FIELDS,
    )
  ) {
    return;
  }

  if (type === "DELETE") {
    const target = oldRecord;
    if (target?.google_event_id) {
      await deleteCalendarEvent(target.google_event_id);
    }
    return;
  }

  if (!record) {
    return;
  }

  if (record.released) {
    await removeEvent(
      "staff_availabilities",
      record.id,
      record.google_event_id,
    );
    return;
  }

  const eventId = await upsertCalendarEvent({
    eventId: record.google_event_id,
    event: await availabilityEvent(record),
  });
  if (eventId !== record.google_event_id) {
    await saveEventId("staff_availabilities", record.id, eventId);
  }
}

async function syncLeave(
  type: WebhookType,
  record: LeaveRecord | null,
  oldRecord: LeaveRecord | null,
): Promise<void> {
  if (
    type === "UPDATE" &&
    record?.google_event_id &&
    onlyMetaChanged(
      oldRecord as unknown as Record<string, unknown> | null,
      record as unknown as Record<string, unknown> | null,
      TRACKED_LEAVE_FIELDS,
    )
  ) {
    return;
  }

  if (type === "DELETE") {
    const target = oldRecord;
    if (target?.google_event_id) {
      await deleteCalendarEvent(target.google_event_id);
    }
    return;
  }

  if (!record) {
    return;
  }

  const eventId = await upsertCalendarEvent({
    eventId: record.google_event_id,
    event: await leaveEvent(record),
  });
  if (eventId !== record.google_event_id) {
    await saveEventId("staff_leaves", record.id, eventId);
  }
}

export async function handleGoogleCalendarWebhook(payload: {
  type?: string;
  table?: string;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
}): Promise<void> {
  const type = payload.type as WebhookType | undefined;
  const table = payload.table;
  if (!type || !table) {
    throw new Error("Webhook payload 缺少 type 或 table");
  }

  if (table === "lessons") {
    await syncLesson(
      type,
      (payload.record as LessonRecord | null) ?? null,
      (payload.old_record as LessonRecord | null) ?? null,
    );
    return;
  }

  if (table === "staff_availabilities") {
    await syncAvailability(
      type,
      (payload.record as AvailabilityRecord | null) ?? null,
      (payload.old_record as AvailabilityRecord | null) ?? null,
    );
    return;
  }

  if (table === "staff_leaves") {
    await syncLeave(
      type,
      (payload.record as LeaveRecord | null) ?? null,
      (payload.old_record as LeaveRecord | null) ?? null,
    );
    return;
  }

  console.error("[googleCalendarSync] ignored table", { table });
}
