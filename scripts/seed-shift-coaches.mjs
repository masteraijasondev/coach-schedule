#!/usr/bin/env node
/**
 * Ensures Tiff and Christy coach accounts exist for staff 報更.
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 *
 * Usage: node scripts/seed-shift-coaches.mjs
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

const COACHES = [
  {
    email: "tiff@smallstepfitness.com",
    fullName: "Tiff",
    password: "TempPass123!",
  },
  {
    email: "christy@smallstepfitness.com",
    fullName: "Christy",
    password: "TempPass123!",
  },
];

async function ensureCoach({ email, fullName, password }) {
  const { users } = await authAdmin("users?page=1&per_page=200");
  const existing = users?.find((u) => u.email === email);

  if (existing) {
    const rows = await rest(`profiles?id=eq.${existing.id}&select=id`);
    if (rows?.[0]) {
      await rest(`profiles?id=eq.${existing.id}`, {
        method: "PATCH",
        body: {
          email,
          full_name: fullName,
          role: "coach",
        },
        prefer: "return=minimal",
      });
    } else {
      await rest("profiles", {
        method: "POST",
        body: {
          id: existing.id,
          email,
          full_name: fullName,
          role: "coach",
          must_change_password: true,
        },
        prefer: "return=minimal",
      });
    }
    console.log(`${fullName}: existing (${existing.id})`);
    return existing.id;
  }

  const created = await authAdmin("users", {
    method: "POST",
    body: {
      email,
      password,
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
      email,
      full_name: fullName,
      role: "coach",
      must_change_password: true,
    },
    prefer: "return=minimal",
  });
  console.log(`${fullName}: created (${userId})`);
  return userId;
}

async function main() {
  for (const coach of COACHES) {
    await ensureCoach(coach);
  }
  console.log("Done.");
  for (const coach of COACHES) {
    console.log(`Login: ${coach.email} / ${coach.password} (must change on first login)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
