import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { redirect } from "next/navigation";

export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    redirect("/login");
  }

  return profile as Profile;
}

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
