import { getSupabaseSecretKey } from "@/lib/supabase/env";
import type { Profile, UserRole } from "@/lib/types";

/** Incoming client values are stripped in middleware before this is set. */
export const PROFILE_HEADER = "x-staff-profile";

export const PROFILE_COOKIE = "staff_profile";

export const PROFILE_SELECT =
  "id, email, full_name, role, must_change_password, active, created_at";

const PROFILE_MAX_AGE_SECONDS = 60 * 60 * 12;

export function homePath(profile: Pick<Profile, "role" | "must_change_password">): string {
  if (profile.must_change_password) {
    return "/change-password";
  }
  return profile.role === "employer" ? "/employer" : "/coach";
}

export function profileCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: PROFILE_MAX_AGE_SECONDS,
  };
}

export function encodeProfileHeader(profile: Profile): string {
  return encodeProfilePayload(profile);
}

export function readProfileHeader(value: string | null): Profile | null {
  if (!value) {
    return null;
  }
  return parseProfilePayload(value);
}

export function parseProfileRecord(value: unknown): Profile | null {
  return isProfile(value) ? value : null;
}

export async function signProfileCookie(profile: Profile): Promise<string> {
  const payload = encodeProfilePayload(profile);
  const signature = await hmac(payload);
  return `${payload}.${bytesToBase64Url(signature)}`;
}

export async function readProfileCookie(value: string | undefined): Promise<Profile | null> {
  if (!value) {
    return null;
  }
  const separator = value.lastIndexOf(".");
  if (separator <= 0) {
    return null;
  }
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = await hmac(payload);
  const actual = base64UrlToBytes(signature);
  if (!actual || !safeEqual(expected, actual)) {
    return null;
  }
  return parseProfilePayload(payload);
}

function encodeProfilePayload(profile: Profile): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(profile)));
}

function parseProfilePayload(payload: string): Profile | null {
  const bytes = base64UrlToBytes(payload);
  if (!bytes) {
    return null;
  }
  try {
    return parseProfileRecord(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    console.error("[parseProfilePayload]", { error });
    return null;
  }
}

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") {
    return false;
  }
  const profile = value as Profile;
  return (
    typeof profile.id === "string" &&
    typeof profile.email === "string" &&
    typeof profile.full_name === "string" &&
    isRole(profile.role) &&
    typeof profile.must_change_password === "boolean" &&
    typeof profile.active === "boolean" &&
    typeof profile.created_at === "string"
  );
}

function isRole(value: unknown): value is UserRole {
  return value === "employer" || value === "coach";
}

async function hmac(value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSupabaseSecretKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return new Uint8Array(signature);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    return null;
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/")
    + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch (error) {
    console.error("[base64UrlToBytes]", { error });
    return null;
  }
}

function safeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
