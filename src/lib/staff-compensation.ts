import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

export type StaffCompensation = {
  staff_kind: string | null;
  hourly_rate_hkd: number | string | null;
  pay_ratio: number | string | null;
};

/** One profiles pay-fields read per request (calendar + salary share). */
export const loadStaffCompensation = cache(
  async (staffId: string): Promise<StaffCompensation | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("staff_kind, hourly_rate_hkd, pay_ratio")
      .eq("id", staffId)
      .maybeSingle();
    if (error) {
      console.error("[loadStaffCompensation]", { error, staffId });
      return null;
    }
    return data;
  },
);
