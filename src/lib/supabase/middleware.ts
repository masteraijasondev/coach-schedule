import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isStaleRefreshToken(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }
  return (
    error.code === "refresh_token_not_found" ||
    error.code === "refresh_token_already_used" ||
    error.message.includes("Refresh Token Not Found") ||
    error.message.includes("Invalid Refresh Token")
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
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

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
    if (isPublicAuthPath) {
      const response = NextResponse.next({ request });
      clearSupabaseAuthCookies(request, response);
      return response;
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    const response = NextResponse.redirect(loginUrl);
    clearSupabaseAuthCookies(request, response);
    return response;
  }

  if (!user && !isPublicAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (!user) {
    return supabaseResponse;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, must_change_password")
    .eq("id", user.id)
    .single();

  if (
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/"
  ) {
    const url = request.nextUrl.clone();
    if (profile?.must_change_password) {
      url.pathname = "/change-password";
    } else if (profile?.role === "employer") {
      url.pathname = "/employer";
    } else {
      url.pathname = "/coach";
    }
    return NextResponse.redirect(url);
  }

  if (pathname !== "/change-password" && pathname !== "/reset-password") {
    if (profile?.must_change_password) {
      const url = request.nextUrl.clone();
      url.pathname = "/change-password";
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/employer") && profile?.role !== "employer") {
      const url = request.nextUrl.clone();
      url.pathname = "/coach";
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/coach") && profile?.role !== "coach") {
      const url = request.nextUrl.clone();
      url.pathname = "/employer";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
