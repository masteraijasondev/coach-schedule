#!/usr/bin/env node
/**
 * Seeds Nora coach + June/July 2026 lessons.
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 *
 * Usage: node scripts/seed-nora.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(root, ".env.local");
  const text = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const baseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const secret =
  env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!baseUrl || !secret) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local",
  );
  process.exit(1);
}

const restHeaders = {
  apikey: secret,
  Authorization: `Bearer ${secret}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function rest(path, { method = "GET", body, prefer } = {}) {
  const headers = { ...restHeaders };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${baseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    throw new Error(
      `REST ${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`,
    );
  }
  return data;
}

async function authAdmin(path, { method = "GET", body } = {}) {
  const res = await fetch(`${baseUrl}/auth/v1/admin/${path}`, {
    method,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Auth ${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`,
    );
  }
  return data;
}

const NORA_EMAIL = "nora@gmail.com";
const NORA_PASSWORD = "TempPass123!";
const NORA_NAME = "Nora";

const MIIT_PER_HEAD = 90;
const PTA_PER_HOUR = 120;
const ADMIN_PER_HOUR = 100;

const STUDENT_RATES = {
  Chi: 300,
  Ivan: 360,
  Pearlie: 450,
  Yauyau: 450,
  Steven: 228,
  Edmond: 270,
  "Sam group": 810,
  "Connie Raymond": 636,
  Kelly: 360,
  "Tiffany Joanna": 636,
  "Candy Barry": 450,
  Mimi: 306,
  "Tiff group": 636,
  "Classpass Steven": 228,
  Junpei: 330,
};

function studentFeeFromCoachPay(coachPay) {
  return Math.round((coachPay / 0.6) * 100) / 100;
}

function hkIso(date, hhmm) {
  const h = Math.floor(hhmm / 100);
  const m = hhmm % 100;
  const pad = (n) => String(n).padStart(2, "0");
  return `${date}T${pad(h)}:${pad(m)}:00+08:00`;
}

function addMinutes(isoStart, minutes) {
  const d = new Date(isoStart);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function parseEnd(date, startHhmm, endHhmm) {
  const startIso = new Date(hkIso(date, startHhmm)).toISOString();
  if (endHhmm) return new Date(hkIso(date, endHhmm)).toISOString();
  return addMinutes(startIso, 60);
}

function durationHours(date, startHhmm, endHhmm) {
  const startIso = new Date(hkIso(date, startHhmm)).toISOString();
  const endIso = parseEnd(date, startHhmm, endHhmm ?? null);
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000;
}

/** @type {Array<{date:string,type:string,student?:string,headcount?:number,start:number,end?:number}>} */
const LESSONS = [
  // 2026-05 結算期（5月11日 – 6月10日）
  { date: "2026-05-22", type: "MIIT", headcount: 2, start: 1900, end: 2000 },
  { date: "2026-05-24", type: "PT", student: "Edmond", start: 1015, end: 1115 },
  { date: "2026-05-24", type: "PT", student: "Classpass Steven", start: 1140, end: 1240 },
  { date: "2026-05-25", type: "PT", student: "Mimi", start: 1800, end: 1900 },
  { date: "2026-05-25", type: "MIIT", headcount: 4, start: 1900, end: 2000 },
  { date: "2026-05-25", type: "PT", student: "Kelly", start: 2000, end: 2100 },
  { date: "2026-05-26", type: "PTA", start: 1830, end: 1930 },
  { date: "2026-05-26", type: "PTA", student: "Kwankwan", start: 1930, end: 2100 },
  { date: "2026-05-31", type: "PT", student: "Sam group", start: 1030, end: 1130 },
  { date: "2026-06-01", type: "MIIT", headcount: 3, start: 1900, end: 2000 },
  { date: "2026-06-01", type: "PT", student: "Kelly", start: 2020, end: 2120 },
  { date: "2026-06-02", type: "PT", student: "Tiff group", start: 1830, end: 1930 },
  { date: "2026-06-02", type: "PT", student: "Yauyau", start: 1930, end: 2030 },
  { date: "2026-06-02", type: "PT", student: "Chi", start: 2030, end: 2130 },
  { date: "2026-06-05", type: "PT", student: "Pearlie", start: 1830, end: 1930 },
  { date: "2026-06-05", type: "MIIT", headcount: 3, start: 1930, end: 2030 },
  { date: "2026-06-07", type: "PT", student: "Yauyau", start: 930, end: 1030 },
  { date: "2026-06-07", type: "PT", student: "Sam group", start: 1030, end: 1130 },
  { date: "2026-06-07", type: "PT", student: "Classpass Steven", start: 1130, end: 1230 },
  { date: "2026-06-07", type: "PT", student: "Ivan", start: 1230, end: 1330 },
  { date: "2026-06-08", type: "MIIT", headcount: 5, start: 1900, end: 2000 },
  { date: "2026-06-09", type: "PT", student: "Tiff group", start: 1830, end: 1930 },
  { date: "2026-06-09", type: "PT", student: "Ivan", start: 2000, end: 2100 },
  // 2026-06 結算期（6月11日 – 7月10日）
  { date: "2026-06-12", type: "MIIT", headcount: 1, start: 1900, end: 2000 },
  { date: "2026-06-12", type: "PT", student: "Yauyau", start: 2000, end: 2100 },
  { date: "2026-06-15", type: "MIIT", headcount: 5, start: 1900, end: 2000 },
  { date: "2026-06-15", type: "PT", student: "Yauyau", start: 2000, end: 2100 },
  { date: "2026-06-19", type: "MIIT", headcount: 1, start: 1900, end: 2000 },
  { date: "2026-06-19", type: "PT", student: "Steven", start: 2000, end: 2100 },
  { date: "2026-06-21", type: "PT", student: "Edmond", start: 930, end: 1030 },
  { date: "2026-06-21", type: "PT", student: "Sam group", start: 1030, end: 1130 },
  { date: "2026-06-21", type: "PT", student: "Connie Raymond", start: 1130, end: 1230 },
  { date: "2026-06-22", type: "PT", student: "Mimi", start: 1800, end: 1900 },
  { date: "2026-06-22", type: "MIIT", headcount: 1, start: 1900, end: 2000 },
  { date: "2026-06-22", type: "PT", student: "Kelly", start: 2000, end: 2100 },
  { date: "2026-06-29", type: "PT", student: "Mimi", start: 1800, end: 1900 },
  { date: "2026-06-29", type: "MIIT", headcount: 7, start: 1900, end: 2000 },
  { date: "2026-06-29", type: "PT", student: "Yauyau", start: 2000, end: 2100 },
  { date: "2026-06-30", type: "PT", student: "Tiffany Joanna", start: 1830, end: 1930 },
  { date: "2026-06-30", type: "PT", student: "Pearlie", start: 1930, end: 2030 },
  { date: "2026-07-03", type: "MIIT", headcount: 5, start: 1900, end: 2000 },
  { date: "2026-07-05", type: "PTA", start: 1030, end: 1130 },
  { date: "2026-07-05", type: "PT", student: "Candy Barry", start: 1130, end: 1230 },
  { date: "2026-07-05", type: "PT", student: "Ivan", start: 1230, end: 1330 },
  { date: "2026-07-06", type: "PT", student: "Mimi", start: 1800, end: 1900 },
  { date: "2026-07-06", type: "MIIT", headcount: 7, start: 1900, end: 2000 },
  { date: "2026-07-09", type: "PTA", start: 1830, end: 1930 },
  { date: "2026-07-09", type: "PT", student: "Kelly", start: 1930, end: 2030 },
  { date: "2026-07-09", type: "PT", student: "Chi", start: 2030, end: 2130 },
  // 2026-07 結算期（7月11日 – 8月10日）
  { date: "2026-07-12", type: "Admin", start: 1030, end: 1230 },
  { date: "2026-07-12", type: "PT", student: "Connie Raymond", start: 1230, end: 1330 },
  { date: "2026-07-13", type: "PT", student: "Mimi", start: 1800, end: 1900 },
  { date: "2026-07-13", type: "MIIT", headcount: 5, start: 1900, end: 2000 },
  { date: "2026-07-13", type: "PT", student: "Kelly", start: 2000, end: 2100 },
  { date: "2026-07-16", type: "PT", student: "Yauyau", start: 1830, end: 1930 },
  { date: "2026-07-16", type: "PT", student: "Kelly", start: 1930, end: 2030 },
  { date: "2026-07-17", type: "MIIT", headcount: 4, start: 1900, end: 2000 },
  { date: "2026-07-19", type: "PT", student: "Edmond", start: 930, end: 1030 },
  { date: "2026-07-19", type: "PT", student: "Candy Barry", start: 1130, end: 1230 },
  { date: "2026-07-19", type: "PT", student: "Chi", start: 1230, end: 1330 },
  { date: "2026-07-20", type: "Admin", start: 1800, end: 1900 },
  { date: "2026-07-20", type: "MIIT", headcount: 6, start: 1900, end: 2000 },
  { date: "2026-07-23", type: "PT", student: "Junpei", start: 1830, end: 1930 },
  { date: "2026-07-23", type: "PT", student: "Ivan", start: 1945, end: 2045 },
  { date: "2026-07-24", type: "MIIT", headcount: 5, start: 1900, end: 2000 },
  { date: "2026-08-02", type: "Admin", start: 1000, end: 1330 },
  { date: "2026-08-03", type: "MIIT", headcount: 3, start: 1900, end: 2000 },
  { date: "2026-08-03", type: "PT", student: "Kelly", start: 2000, end: 2100 },
  { date: "2026-08-06", type: "Admin", start: 1830, end: 2030 },
  { date: "2026-08-06", type: "PT", student: "Chi", start: 2030, end: 2130 },
];

async function ensureMigrationApplied() {
  try {
    await rest("lesson_types?select=pay_mode&limit=1");
    console.log("Migration 004 columns present.");
    await rest("coach_student_rates?select=student_fee_hkd&limit=1");
    console.log("Migration 006 columns present.");
  } catch (error) {
    console.error(
      "Required migrations not applied. Run supabase db push or apply 004 + 006 in Supabase SQL Editor.",
    );
    console.error(error.message);
    process.exit(1);
  }
}

async function ensureNoraUser() {
  const { users } = await authAdmin("users?page=1&per_page=200");
  const existing = users?.find((u) => u.email === NORA_EMAIL);

  if (existing) {
    const rows = await rest(`profiles?id=eq.${existing.id}&select=id`);
    if (rows?.[0]) {
      // Do not reset must_change_password — that traps the user on /change-password.
      await rest(`profiles?id=eq.${existing.id}`, {
        method: "PATCH",
        body: {
          email: NORA_EMAIL,
          full_name: NORA_NAME,
          role: "coach",
        },
        prefer: "return=minimal",
      });
    } else {
      await rest("profiles", {
        method: "POST",
        body: {
          id: existing.id,
          email: NORA_EMAIL,
          full_name: NORA_NAME,
          role: "coach",
          must_change_password: true,
        },
        prefer: "return=minimal",
      });
    }
    return existing.id;
  }

  const created = await authAdmin("users", {
    method: "POST",
    body: {
      email: NORA_EMAIL,
      password: NORA_PASSWORD,
      email_confirm: true,
    },
  });

  const userId = created.id ?? created.user?.id;
  if (!userId) {
    throw new Error(`Unexpected create user response: ${JSON.stringify(created)}`);
  }

  await rest("profiles", {
    method: "POST",
    body: {
      id: userId,
      email: NORA_EMAIL,
      full_name: NORA_NAME,
      role: "coach",
      must_change_password: true,
    },
    prefer: "return=minimal",
  });
  return userId;
}

async function ensureLessonTypes() {
  const specs = [
    { name: "PT", pay_mode: "per_student", default_duration_minutes: 60 },
    { name: "MIIT", pay_mode: "per_head", default_duration_minutes: 60 },
    { name: "PTA", pay_mode: "per_hour", default_duration_minutes: 60 },
    { name: "Admin", pay_mode: "per_hour", default_duration_minutes: 60 },
  ];

  const typeIds = {};
  for (const spec of specs) {
    const rows = await rest(
      `lesson_types?name=eq.${encodeURIComponent(spec.name)}&select=id`,
    );
    if (rows?.[0]) {
      await rest(`lesson_types?id=eq.${rows[0].id}`, {
        method: "PATCH",
        body: {
          pay_mode: spec.pay_mode,
          default_duration_minutes: spec.default_duration_minutes,
          active: true,
        },
        prefer: "return=minimal",
      });
      typeIds[spec.name] = rows[0].id;
    } else {
      const inserted = await rest("lesson_types", {
        method: "POST",
        body: spec,
      });
      typeIds[spec.name] = inserted[0].id;
    }
  }
  return typeIds;
}

async function ensureStudents() {
  const names = [...new Set([...Object.keys(STUDENT_RATES), "Kwankwan"])];
  const studentIds = {};
  for (const name of names) {
    const rows = await rest(
      `students?name=eq.${encodeURIComponent(name)}&select=id`,
    );
    if (rows?.[0]) {
      studentIds[name] = rows[0].id;
    } else {
      const inserted = await rest("students", {
        method: "POST",
        body: { name, active: true },
      });
      studentIds[name] = inserted[0].id;
    }
  }
  return studentIds;
}

async function seedRates(coachId, typeIds, studentIds) {
  for (const [name, amount] of Object.entries(STUDENT_RATES)) {
    await rest("coach_student_rates", {
      method: "POST",
      body: {
        coach_id: coachId,
        student_id: studentIds[name],
        amount_hkd: amount,
        student_fee_hkd: studentFeeFromCoachPay(amount),
      },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }

  const coachRates = [
    { lesson_type_id: typeIds.MIIT, amount_hkd: MIIT_PER_HEAD },
    { lesson_type_id: typeIds.PTA, amount_hkd: PTA_PER_HOUR },
    { lesson_type_id: typeIds.Admin, amount_hkd: ADMIN_PER_HOUR },
  ];
  for (const rate of coachRates) {
    await rest("coach_rates", {
      method: "POST",
      body: { coach_id: coachId, ...rate },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
}

function earnedAmount(row) {
  if (row.type === "PT") return STUDENT_RATES[row.student];
  if (row.type === "MIIT") return row.headcount * MIIT_PER_HEAD;
  if (row.type === "PTA") {
    return Math.round(durationHours(row.date, row.start, row.end ?? null) * PTA_PER_HOUR * 100) / 100;
  }
  if (row.type === "Admin") {
    return Math.round(durationHours(row.date, row.start, row.end ?? null) * ADMIN_PER_HOUR * 100) / 100;
  }
  throw new Error(`Unknown type ${row.type}`);
}

function payrollPeriodForDate(dateYmd) {
  const [y, m, d] = dateYmd.split("-").map(Number);
  if (d >= 11) return `${y}-${String(m).padStart(2, "0")}`;
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function seedLessons(coachId, typeIds, studentIds) {
  const rangeStart = encodeURIComponent("2026-05-01T00:00:00+08:00");
  const rangeEnd = encodeURIComponent("2026-09-01T00:00:00+08:00");
  const existingLessons = await rest(
    `lessons?coach_id=eq.${coachId}&starts_at=gte.${rangeStart}&starts_at=lt.${rangeEnd}&select=id`,
  );

  if (existingLessons?.length) {
    const ids = existingLessons.map((l) => l.id).join(",");
    await rest(`lesson_students?lesson_id=in.(${ids})`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
    await rest(`lessons?id=in.(${ids})`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
  }

  for (const row of LESSONS) {
    const startIso = new Date(hkIso(row.date, row.start)).toISOString();
    const endIso = parseEnd(row.date, row.start, row.end ?? null);
    const amount = earnedAmount(row);

    const inserted = await rest("lessons", {
      method: "POST",
      body: {
        lesson_type_id: typeIds[row.type],
        starts_at: startIso,
        ends_at: endIso,
        status: "completed",
        coach_id: coachId,
        earned_amount_hkd: amount,
        student_fee_hkd:
          row.type === "PT" && row.student
            ? studentFeeFromCoachPay(STUDENT_RATES[row.student])
            : null,
        headcount: row.headcount ?? null,
        expected_headcount: row.expected_headcount ?? null,
      },
    });

    if (row.student && studentIds[row.student]) {
      await rest("lesson_students", {
        method: "POST",
        body: {
          lesson_id: inserted[0].id,
          student_id: studentIds[row.student],
        },
        prefer: "return=minimal",
      });
    }
  }

  const totals = {};
  for (const row of LESSONS) {
    const period = payrollPeriodForDate(row.date);
    totals[period] = (totals[period] ?? 0) + earnedAmount(row);
  }
  console.log("Period totals:", totals);
}

async function main() {
  console.log("Checking migration...");
  await ensureMigrationApplied();

  console.log("Ensuring Nora coach account...");
  const coachId = await ensureNoraUser();
  console.log(`Nora coach id: ${coachId}`);

  console.log("Setting up lesson types...");
  const typeIds = await ensureLessonTypes();

  console.log("Creating students...");
  const studentIds = await ensureStudents();

  console.log("Seeding rates...");
  await seedRates(coachId, typeIds, studentIds);

  console.log(`Seeding ${LESSONS.length} lessons...`);
  await seedLessons(coachId, typeIds, studentIds);

  console.log("Done.");
  console.log(`Login: ${NORA_EMAIL} / ${NORA_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
