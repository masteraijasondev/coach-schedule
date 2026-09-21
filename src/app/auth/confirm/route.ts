import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/reset-password";
  }
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const next = safeNextPath(searchParams.get("next"));
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next;
  redirectTo.search = "";

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
    console.error("[auth/confirm] exchangeCodeForSession", {
      message: error.message,
    });
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
    console.error("[auth/confirm] verifyOtp", {
      message: error.message,
      type,
    });
  }

  const failure = request.nextUrl.clone();
  failure.pathname = "/forgot-password";
  failure.searchParams.set("error", "link");
  return NextResponse.redirect(failure);
}
