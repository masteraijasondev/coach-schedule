#!/usr/bin/env node
/**
 * Applies supabase/migrations/004_pay_modes.sql via direct Postgres connection.
 * Set DATABASE_URL in .env.local (Supabase → Settings → Database → Connection string).
 *
 * Usage: node scripts/run-migration-004.mjs
 */

import pg from "pg";
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
const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "Add DATABASE_URL to .env.local (Supabase dashboard → Database → URI), then re-run.",
  );
  process.exit(1);
}

const sql = readFileSync(
  resolve(root, "supabase/migrations/004_pay_modes.sql"),
  "utf8",
);

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log("Migration 004 applied.");
} finally {
  await client.end();
}
