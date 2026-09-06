#!/usr/bin/env node
/**
 * Import Jason-calendar Acuity cover lessons into Nora's coach schedule.
 *
 * Rule: Airtable Appointment Notes contains the cover coach name (e.g. "Nora").
 * Calendar must be Jason Chan. Creates completed PT lessons in Supabase.
 *
 * Usage:
 *   node scripts/import-nora-from-airtable.mjs --date 2026-08-30
 *   node scripts/import-nora-from-airtable.mjs --from 2026-08-30 --to 2026-08-31 --coach Nora --dry-run
 *
 * Env:
 *   employee/.env.local  — Supabase (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)
 *   ssf-ase/.env         — Airtable (AIRTABLE_API_TOKEN, AIRTABLE_BASE_ID)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const employeeRoot = resolve(__dirname, "..");
const aseEnvPath = resolve(employeeRoot, "..", "..", "Documents", "projects", "ssf-ase", ".env");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(employeeRoot, ".env.local"));
loadEnvFile(aseEnvPath);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const coachTag = (args.find((a) => a.startsWith("--coach="))?.split("=")[1] ||
  "Nora").trim();
const dateArg = args.find((a) => a.startsWith("--date="))?.split("=")[1];
const fromArg = args.find((a) => a.startsWith("--from="))?.split("=")[1] || dateArg;
const toArg = args.find((a) => a.startsWith("--to="))?.split("=")[1] || dateArg;

if (!fromArg || !toArg) {
  console.error("Usage: node scripts/import-nora-from-airtable.mjs --date YYYY-MM-DD [--coach Nora] [--dry-run]");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const airtableToken = process.env.AIRTABLE_API_TOKEN;
const airtableBase = process.env.AIRTABLE_BASE_ID || "app6XDt9DxsHqgAoW";
const TBL_APT = "tblvxtHDyR0rK1qY3";
const TBL_STU = "tblRNs4uSivWUHWho";

if (!supabaseUrl || !supabaseSecret) {
  console.error("Missing Supabase env in employee/.env.local");
  process.exit(1);
}
if (!airtableToken) {
  console.error("Missing AIRTABLE_API_TOKEN (ssf-ase/.env)");
  process.exit(1);
}

const restHeaders = {
  apikey: supabaseSecret,
  Authorization: `Bearer ${supabaseSecret}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function supabaseRest(path, { method = "GET", body, prefer } = {}) {
  const headers = { ...restHeaders };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
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
    throw new Error(`Supabase ${method} ${path} (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function airtableAll(table, formula, fields) {
  const out = [];
  let offset;
  do {
    const qs = new URLSearchParams({ pageSize: "100" });
    if (formula) qs.set("filterByFormula", formula);
    for (const f of fields) qs.append("fields[]", f);
    if (offset) qs.set("offset", offset);
    const res = await fetch(`https://api.airtable.com/v0/${airtableBase}/${table}?${qs}`, {
      headers: { Authorization: `Bearer ${airtableToken}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json));
    out.push(...(json.records || []));
    offset = json.offset;
  } while (offset);
  return out;
}

/** Map Airtable student display name → coach-schedule student key */
const STUDENT_ALIASES = [
  { re: /chi\s*hang|edmond\s*yip/i, key: "Chi" },
  { re: /yau\s*yau|yauyau/i, key: "Yauyau" },
  { re: /pearlie/i, key: "Pearlie" },
  { re: /connie\s*raymond/i, key: "Connie Raymond" },
  { re: /\bivan\b/i, key: "Ivan" },
  { re: /\bkelly\b/i, key: "Kelly" },
  { re: /\bmimi\b/i, key: "Mimi" },
  { re: /sam\s*group/i, key: "Sam group" },
  { re: /tiff\s*group/i, key: "Tiff group" },
  { re: /\bedmond\b/i, key: "Edmond" },
  { re: /\bsteven\b/i, key: "Steven" },
];

function resolveStudentKey(name) {
  const n = String(name || "").trim();
  for (const { re, key } of STUDENT_ALIASES) {
    if (re.test(n)) return key;
  }
  return null;
}

function notesHasCoach(notes, coach) {
  return new RegExp(`\\b${coach.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
    String(notes || ""),
  );
}

function acuityNote(id) {
  return `acuity:${id}`;
}

async function main() {
  const formula = `AND(
    IS_AFTER({Start Time}, DATEADD('${fromArg}', -1, 'days')),
    IS_BEFORE({Start Time}, DATEADD('${toArg}', 1, 'days')),
    NOT({Canceled}),
    FIND('Jason', {Calendar})
  )`;
  const appts = await airtableAll(TBL_APT, formula, [
    "Appointment ID",
    "Start Time",
    "End Time",
    "Type",
    "Calendar",
    "Notes",
    "Student",
  ]);

  const coverAppts = appts.filter((r) => notesHasCoach(r.fields.Notes, coachTag));
  if (!coverAppts.length) {
    console.log(`No Jason-calendar appointments with Notes containing "${coachTag}" in range.`);
    return;
  }

  const stuIds = [...new Set(coverAppts.flatMap((r) => r.fields.Student || []))];
  const stuNameById = new Map();
  if (stuIds.length) {
    const stuFormula = `OR(${stuIds.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
    const students = await airtableAll(TBL_STU, stuFormula, ["Full_Name", "Student_Name"]);
    for (const s of students) {
      stuNameById.set(s.id, s.fields.Full_Name || s.fields.Student_Name || s.id);
    }
  }

  const coachRows = await supabaseRest(
    `profiles?role=eq.coach&select=id,full_name,email`,
  );
  const coach = coachRows.find(
    (c) =>
      c.full_name?.toLowerCase() === coachTag.toLowerCase() ||
      c.email?.toLowerCase().startsWith(`${coachTag.toLowerCase()}@`),
  );
  if (!coach) {
    throw new Error(`Coach "${coachTag}" not found in Supabase profiles`);
  }

  const ptTypeRows = await supabaseRest(`lesson_types?name=eq.PT&select=id&limit=1`);
  const ptTypeId = ptTypeRows?.[0]?.id;
  if (!ptTypeId) throw new Error("PT lesson type not found");

  const studentRows = await supabaseRest("students?select=id,name");
  const studentIdByName = new Map(studentRows.map((s) => [s.name, s.id]));

  const rangeStart = `${fromArg}T00:00:00+08:00`;
  const rangeEnd = `${toArg}T23:59:59+08:00`;
  const existingLessons = await supabaseRest(
    `lessons?coach_id=eq.${coach.id}&starts_at=gte.${encodeURIComponent(rangeStart)}&starts_at=lte.${encodeURIComponent(rangeEnd)}&select=id,starts_at,notes`,
  );
  const existingAcuity = new Set(
    (existingLessons || [])
      .map((l) => String(l.notes || "").match(/acuity:(\d+)/)?.[1])
      .filter(Boolean),
  );

  let created = 0;
  let skipped = 0;

  for (const row of coverAppts.sort((a, b) =>
    String(a.fields["Start Time"]).localeCompare(String(b.fields["Start Time"])),
  )) {
    const f = row.fields;
    const acuityId = String(f["Appointment ID"] || "");
    const displayName = (f.Student || []).map((id) => stuNameById.get(id)).filter(Boolean)[0] || "?";
    const studentKey = resolveStudentKey(displayName);
    const studentId = studentKey ? studentIdByName.get(studentKey) : null;

    const hkt = new Date(f["Start Time"]).toLocaleString("en-HK", {
      timeZone: "Asia/Hong_Kong",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    if (existingAcuity.has(acuityId)) {
      console.log(`SKIP existing acuity:${acuityId} ${hkt} ${displayName}`);
      skipped++;
      continue;
    }

    if (!studentKey || !studentId) {
      console.warn(`SKIP unmapped student "${displayName}" acuity:${acuityId}`);
      skipped++;
      continue;
    }

    const rateRows = await supabaseRest(
      `coach_student_rates?coach_id=eq.${coach.id}&student_id=eq.${studentId}&select=amount_hkd,student_fee_hkd&limit=1`,
    );
    const rate = rateRows?.[0];
    if (!rate) {
      console.warn(`SKIP no coach×student rate for ${studentKey} acuity:${acuityId}`);
      skipped++;
      continue;
    }

    const payload = {
      lesson_type_id: ptTypeId,
      starts_at: f["Start Time"],
      ends_at: f["End Time"],
      status: "completed",
      coach_id: coach.id,
      earned_amount_hkd: Number(rate.amount_hkd),
      student_fee_hkd: Number(rate.student_fee_hkd),
      notes: `${acuityNote(acuityId)} | ${displayName} | Jason cover`,
    };

    console.log(
      `${dryRun ? "DRY-RUN" : "CREATE"} ${hkt} ${displayName} → ${coach.full_name} HKD ${rate.amount_hkd} (${acuityId})`,
    );

    if (!dryRun) {
      const inserted = await supabaseRest("lessons", {
        method: "POST",
        body: payload,
      });
      await supabaseRest("lesson_students", {
        method: "POST",
        body: {
          lesson_id: inserted[0].id,
          student_id: studentId,
        },
        prefer: "return=minimal",
      });
      existingAcuity.add(acuityId);
    }
    created++;
  }

  console.log(`Done. ${dryRun ? "Would create" : "Created"} ${created}, skipped ${skipped}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
