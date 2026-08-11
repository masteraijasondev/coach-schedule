export type UserRole = "employer" | "coach";
export type LessonStatus = "open" | "assigned" | "completed" | "cancelled";
export type RequestStatus = "pending" | "approved" | "rejected";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  must_change_password: boolean;
  created_at: string;
};

export type Student = {
  id: string;
  name: string;
  notes: string | null;
  active: boolean;
  created_at: string;
};

export type LessonType = {
  id: string;
  name: string;
  default_duration_minutes: number;
  active: boolean;
  created_at: string;
};

export type CoachRate = {
  coach_id: string;
  lesson_type_id: string;
  amount_hkd: number;
};

export type Lesson = {
  id: string;
  lesson_type_id: string;
  starts_at: string;
  ends_at: string;
  status: LessonStatus;
  coach_id: string | null;
  earned_amount_hkd: number | null;
  notes: string | null;
  created_at: string;
};

export type LessonRequest = {
  id: string;
  lesson_id: string;
  coach_id: string;
  status: RequestStatus;
  created_at: string;
};

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };
