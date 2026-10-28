"use client";

import { listAirtableStudentNamesAction } from "@/actions/students";

let cachedNames: string[] | null = null;
let inflight: Promise<string[]> | null = null;

/** Session-scoped Airtable name list — shared across check-in forms. */
export async function ensureAirtableStudentNames(): Promise<
  { ok: true; names: string[] } | { ok: false; error: string }
> {
  if (cachedNames) {
    return { ok: true, names: cachedNames };
  }
  if (inflight) {
    try {
      const names = await inflight;
      return { ok: true, names };
    } catch (error) {
      console.error("[ensureAirtableStudentNames] inflight", { error });
      return { ok: false, error: "無法載入學生名單" };
    }
  }

  const request = (async () => {
    const result = await listAirtableStudentNamesAction();
    if (!result.ok) {
      throw new Error(result.error);
    }
    cachedNames = result.data;
    return result.data;
  })().finally(() => {
    inflight = null;
  });

  inflight = request;
  try {
    const names = await request;
    return { ok: true, names };
  } catch (error) {
    console.error("[ensureAirtableStudentNames]", { error });
    return { ok: false, error: "無法載入學生名單" };
  }
}

export function clearAirtableStudentNamesCache() {
  cachedNames = null;
}
