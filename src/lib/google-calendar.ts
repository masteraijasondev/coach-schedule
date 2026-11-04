import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/constants";

type CalendarConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string;
};

export type CalendarEventInput = {
  summary: string;
  description: string;
  colorId?: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
};

export function googleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
      process.env.GOOGLE_CALENDAR_REFRESH_TOKEN &&
      process.env.GOOGLE_CALENDAR_ID,
  );
}

function calendarConfig(): CalendarConfig | null {
  if (!googleCalendarConfigured()) {
    return null;
  }
  return {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "",
    refreshToken: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN ?? "",
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? "",
  };
}

async function accessToken(config: CalendarConfig): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!response.ok || !payload.access_token) {
    console.error("[googleCalendar] token", {
      status: response.status,
      error: payload.error,
    });
    throw new Error("Google Calendar 登入失敗");
  }
  return payload.access_token;
}

function eventsUrl(calendarId: string, eventId?: string): string {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

export function hongKongDateTime(iso: string): {
  dateTime: string;
  timeZone: string;
} {
  return {
    dateTime: formatInTimeZone(new Date(iso), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss"),
    timeZone: TIMEZONE,
  };
}

export function hongKongMinuteRange(
  dateYmd: string,
  startMinute: number,
  endMinute: number,
): {
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
} {
  const startHour = Math.floor(startMinute / 60);
  const startMin = startMinute % 60;
  const endHour = Math.floor(endMinute / 60);
  const endMin = endMinute % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    start: {
      dateTime: `${dateYmd}T${pad(startHour)}:${pad(startMin)}:00`,
      timeZone: TIMEZONE,
    },
    end: {
      dateTime: `${dateYmd}T${pad(endHour)}:${pad(endMin)}:00`,
      timeZone: TIMEZONE,
    },
  };
}

export async function upsertCalendarEvent(input: {
  eventId?: string | null;
  event: CalendarEventInput;
}): Promise<string> {
  const config = calendarConfig();
  if (!config) {
    throw new Error("尚未設定 Google Calendar");
  }
  const token = await accessToken(config);
  const updating = Boolean(input.eventId);
  const response = await fetch(
    eventsUrl(config.calendarId, updating ? input.eventId ?? undefined : undefined),
    {
      method: updating ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.event.summary,
        description: input.event.description,
        colorId: input.event.colorId,
        start: input.event.start,
        end: input.event.end,
        reminders: {
          useDefault: false,
          overrides: [{ method: "popup", minutes: 10 }],
        },
      }),
    },
  );
  const payload = (await response.json()) as {
    id?: string;
    error?: { message?: string; code?: number };
  };
  if (response.status === 404 && updating) {
    return upsertCalendarEvent({ eventId: null, event: input.event });
  }
  if (!response.ok || !payload.id) {
    console.error("[googleCalendar] upsert", {
      status: response.status,
      error: payload.error,
    });
    throw new Error(payload.error?.message ?? "寫入 Google Calendar 失敗");
  }
  return payload.id;
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const config = calendarConfig();
  if (!config) {
    throw new Error("尚未設定 Google Calendar");
  }
  const token = await accessToken(config);
  const response = await fetch(eventsUrl(config.calendarId, eventId), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 204 || response.status === 404 || response.status === 410) {
    return;
  }
  let detail = "";
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    detail = payload.error?.message ?? "";
  } catch (error) {
    console.error("[googleCalendar] delete parse", { error, eventId });
  }
  console.error("[googleCalendar] delete", {
    status: response.status,
    eventId,
    detail,
  });
  throw new Error("移除 Google Calendar 事件失敗");
}
