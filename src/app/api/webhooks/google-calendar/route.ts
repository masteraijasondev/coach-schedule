import { googleCalendarConfigured } from "@/lib/google-calendar";
import { handleGoogleCalendarWebhook } from "@/lib/google-calendar-sync";

export const runtime = "nodejs";

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

function readBearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.GOOGLE_CALENDAR_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[googleCalendarWebhook] missing GOOGLE_CALENDAR_WEBHOOK_SECRET");
    return Response.json({ error: "not configured" }, { status: 503 });
  }

  const token = readBearer(request);
  if (!token || token !== expected) {
    return unauthorized();
  }

  if (!googleCalendarConfigured()) {
    console.error("[googleCalendarWebhook] calendar env incomplete");
    return Response.json({ error: "calendar not configured" }, { status: 503 });
  }

  let payload: {
    type?: string;
    table?: string;
    record?: Record<string, unknown> | null;
    old_record?: Record<string, unknown> | null;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch (error) {
    console.error("[googleCalendarWebhook] json", { error });
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    await handleGoogleCalendarWebhook(payload);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[googleCalendarWebhook] sync", {
      error,
      type: payload.type,
      table: payload.table,
    });
    return Response.json({ error: "sync failed" }, { status: 500 });
  }
}
