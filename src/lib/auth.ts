import { PROFILE_HEADER, PROFILE_SELECT, parseProfileRecord, readProfileHeader } from "@/lib/session-profile";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export const requireProfile = cache(async (): Promise<Profile> => {
  const fromMiddleware = readProfileHeader((await headers()).get(PROFILE_HEADER));
  if (fromMiddleware) {
    return fromMiddleware;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .single();
  const profile = parseProfileRecord(data);

  if (error || !profile) {
    redirect("/login");
  }

  return profile;
});

export async function requireEmployer(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "employer") {
    redirect("/coach");
  }
  return profile;
}

export async function requireCoach(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "coach") {
    redirect("/employer");
  }
  return profile;
}
