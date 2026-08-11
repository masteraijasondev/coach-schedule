function requiredEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`缺少環境變數：${name}`);
  }
  return value;
}

export function getSupabaseUrl(): string {
  return requiredEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

/** Browser-safe key: publishable (new) or anon (legacy). */
export function getSupabasePublishableKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return requiredEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    key,
  );
}

/** Server-only key: secret (new) or service_role (legacy). */
export function getSupabaseSecretKey(): string {
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return requiredEnv(
    "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
    key,
  );
}
