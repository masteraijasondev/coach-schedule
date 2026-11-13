const ACUITY_API_BASE = "https://acuityscheduling.com/api/v1";

const STUDENT_GENDERS = ["男", "女"] as const;
export type AcuityStudentGender = (typeof STUDENT_GENDERS)[number];

function acuityCredentials(): { userId: string; apiKey: string } | null {
  const userId = process.env.ACUITY_USER_ID?.trim() || "";
  const apiKey = process.env.ACUITY_API_KEY?.trim() || "";
  if (!userId || !apiKey) {
    return null;
  }
  return { userId, apiKey };
}

function acuityAuthHeader(userId: string, apiKey: string): string {
  return `Basic ${Buffer.from(`${userId}:${apiKey}`).toString("base64")}`;
}

/** Acuity requires both names; single-token names go in firstName with "-" lastName. */
export function splitClientName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }
  return { firstName: fullName.trim(), lastName: "-" };
}

export async function createAcuityClient(input: {
  name: string;
  phone: string;
  email: string | null;
  gender: AcuityStudentGender | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const credentials = acuityCredentials();
  if (!credentials) {
    return { ok: false, error: "尚未設定 Acuity" };
  }

  const name = input.name.trim();
  const phone = input.phone.trim();
  const email = input.email?.trim() || null;
  const digits = phone.replace(/\D/g, "");
  if (!name) {
    return { ok: false, error: "請輸入學生姓名" };
  }
  if (digits.length < 8) {
    return { ok: false, error: "請輸入有效電話" };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "電郵格式不正確" };
  }
  if (input.gender && !STUDENT_GENDERS.includes(input.gender)) {
    return { ok: false, error: "性別只可以選擇男或女" };
  }

  const { firstName, lastName } = splitClientName(name);
  const body: Record<string, string> = {
    firstName,
    lastName,
    phone,
  };
  if (email) {
    body.email = email;
  }
  if (input.gender) {
    body.notes = `性別：${input.gender}`;
  }

  try {
    const response = await fetch(`${ACUITY_API_BASE}/clients`, {
      method: "POST",
      headers: {
        Authorization: acuityAuthHeader(credentials.userId, credentials.apiKey),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;

    if (!response.ok) {
      console.error("[createAcuityClient] acuity", {
        status: response.status,
        message: payload?.message,
        error: payload?.error,
      });
      if (
        response.status === 400 &&
        (payload?.error === "client_aready_exists" ||
          payload?.message?.toLowerCase().includes("already exists"))
      ) {
        return { ok: false, error: "此客戶已存在於 Acuity" };
      }
      if (response.status === 401) {
        return { ok: false, error: "Acuity 認證失敗" };
      }
      return { ok: false, error: "寫入 Acuity 失敗" };
    }

    return { ok: true };
  } catch (error) {
    console.error("[createAcuityClient]", { error });
    return { ok: false, error: "寫入 Acuity 失敗" };
  }
}
