import {
  encodeProfileHeader,
  homePath,
  PROFILE_COOKIE,
  PROFILE_HEADER,
  PROFILE_SELECT,
  parseProfileRecord,
  profileCookieOptions,
  readProfileCookie,
  signProfileCookie,
} from "@/lib/session-profile";
import type { Profile } from "@/lib/types";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type AuthCookie = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

function isStaleRefreshToken(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }
  return (
    error.code === "refresh_token_not_found" ||
    error.code === "refresh_token_already_used" ||
    error.message?.includes("Refresh Token Not Found") ||
    error.message?.includes("Invalid Refresh Token")
  );
}

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (!cookie.name.startsWith("sb-") || !cookie.name.includes("-auth-token")) {
      continue;
    }
    request.cookies.delete(cookie.name);
    response.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
  }
  response.cookies.set(PROFILE_COOKIE, "", { path: "/", maxAge: 0 });
}

function applyAuthCookies(response: NextResponse, authCookies: AuthCookie[]) {
  for (const cookie of authCookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
}

function finish(
  request: NextRequest,
  authCookies: AuthCookie[],
  profile: Profile,
  profileCookie: string | null,
  destination?: { kind: "redirect" | "rewrite"; pathname: string },
) {
  const headers = new Headers(request.headers);
  headers.delete(PROFILE_HEADER);
  headers.set(PROFILE_HEADER, encodeProfileHeader(profile));

  const url = request.nextUrl.clone();
  if (destination) {
    url.pathname = destination.pathname;
  }
  const response =
    destination?.kind === "redirect"
      ? NextResponse.redirect(url)
      : destination?.kind === "rewrite"
        ? NextResponse.rewrite(url, { request: { headers } })
        : NextResponse.next({ request: { headers } });

  applyAuthCookies(response, authCookies);
  if (profileCookie) {
    response.cookies.set(PROFILE_COOKIE, profileCookie, profileCookieOptions());
  }
  return response;
}

export async function updateSession(request: NextRequest) {
  const authCookies: AuthCookie[] = [];
  request.headers.delete(PROFILE_HEADER);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        authCookies.splice(0, authCookies.length, ...cookiesToSet);
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicAuthPath =
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/auth/");

  if (isStaleRefreshToken(authError)) {
    const response = isPublicAuthPath
      ? NextResponse.next({ request })
      : NextResponse.redirect(loginUrl(request));
    clearSupabaseAuthCookies(request, response);
    return response;
  }

  if (!user && !isPublicAuthPath) {
    const response = NextResponse.redirect(loginUrl(request));
    response.cookies.set(PROFILE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }

  if (!user) {
    const response = NextResponse.next({ request });
    applyAuthCookies(response, authCookies);
    return response;
  }

  const cached = await readProfileCookie(request.cookies.get(PROFILE_COOKIE)?.value);
  let profile = cached?.id === user.id ? cached : null;
  let profileCookie: string | null = null;
  if (!profile) {
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", user.id)
      .single();
    profile = parseProfileRecord(data);
    if (error || !profile) {
      console.error("[updateSession] profile", { error });
      const response = NextResponse.redirect(loginUrl(request));
      clearSupabaseAuthCookies(request, response);
      return response;
    }
    profileCookie = await signProfileCookie(profile);
  }

  if (!profile.active) {
    const response = isPublicAuthPath
      ? NextResponse.next({ request })
      : NextResponse.redirect(loginUrl(request));
    clearSupabaseAuthCookies(request, response);
    return response;
  }

  const destination = homePath(profile);
  if (pathname === "/") {
    return finish(request, authCookies, profile, profileCookie, {
      kind: destination === "/change-password" ? "redirect" : "rewrite",
      pathname: destination,
    });
  }

  if (pathname === "/login" || pathname === "/forgot-password") {
    return finish(request, authCookies, profile, profileCookie, {
      kind: "redirect",
      pathname: destination,
    });
  }

  if (pathname !== "/change-password" && pathname !== "/reset-password") {
    if (profile.must_change_password) {
      return finish(request, authCookies, profile, profileCookie, {
        kind: "redirect",
        pathname: "/change-password",
      });
    }

    if (pathname.startsWith("/employer") && profile.role !== "employer") {
      return finish(request, authCookies, profile, profileCookie, {
        kind: "redirect",
        pathname: "/coach",
      });
    }

    if (pathname.startsWith("/coach") && profile.role !== "coach") {
      return finish(request, authCookies, profile, profileCookie, {
        kind: "redirect",
        pathname: "/employer",
      });
    }
  }

  return finish(request, authCookies, profile, profileCookie);
}

function loginUrl(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return url;
}
