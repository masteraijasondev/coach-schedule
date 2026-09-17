const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "app6XDt9DxsHqgAoW";
const STUDENT_TABLE = "tblRNs4uSivWUHWho";
const APPOINTMENT_TABLE = "tblvxtHDyR0rK1qY3";
const CACHE_MS = 10 * 60 * 1000;
const MAX_PAGES = 30;

const STUDENT_ALIASES: { re: RegExp; key: string }[] = [
  { re: /chi\s*hang|edmond\s*yip/i, key: "Chi" },
  { re: /yau\s*yau|yauyau/i, key: "Yauyau" },
  { re: /pearlie/i, key: "Pearlie" },
  { re: /connie\s*raymond/i, key: "Connie Raymond" },
  { re: /\bivan\b/i, key: "Ivan" },
  { re: /\bkelly\b/i, key: "Kelly" },
  { re: /\bmimi\b/i, key: "Mimi" },
  { re: /sam\s*group/i, key: "Sam group" },
  { re: /tiff\s*group/i, key: "Tiff group" },
  { re: /\bedmond\b/i, key: "Edmond" },
  { re: /classpass\s*steven/i, key: "Classpass Steven" },
  { re: /\bsteven\b/i, key: "Steven" },
  { re: /kwan\s*kwan|kwankwan/i, key: "Kwankwan" },
  { re: /\bjunpei\b/i, key: "Junpei" },
  { re: /candy\s*barry/i, key: "Candy Barry" },
  { re: /tiffany\s*joanna|\btiffany\b/i, key: "Tiffany Joanna" },
];

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type CacheEntry = {
  at: number;
  byLocalName: Map<string, number>;
  error: string | null;
};

let cache: CacheEntry | null = null;

function airtableToken(): string | null {
  return process.env.AIRTABLE_API_TOKEN?.trim() || null;
}

function fieldString(fields: Record<string, unknown>, key: string): string {
  const value = fields[key];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return "";
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/-?\s*stu\d+\s*$/i, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
}

function aliasKeys(name: string): string[] {
  return STUDENT_ALIASES.filter(({ re }) => re.test(name)).map(({ key }) => key);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameMatchScore(display: string, key: string): number {
  const normalizedDisplay = normalizeName(display);
  const normalizedKey = normalizeName(key);
  if (!normalizedKey) {
    return 0;
  }
  if (normalizedDisplay === normalizedKey) {
    return 4;
  }
  if (normalizedDisplay.startsWith(`${normalizedKey} `)) {
    return 3;
  }
  const word = new RegExp(`(?:^| )${escapeRegExp(normalizedKey)}(?: |$)`);
  if (word.test(normalizedDisplay)) {
    return 2;
  }
  return 1;
}

type IndexedTuition = {
  tuition: number;
  score: number;
  sampleCount: number;
};

function putIndexedTuition(
  index: Map<string, IndexedTuition>,
  key: string,
  tuition: number,
  display: string,
  sampleCount: number,
) {
  const score = nameMatchScore(display, key);
  const existing = index.get(key);
  if (
    !existing ||
    score > existing.score ||
    (score === existing.score && sampleCount > existing.sampleCount)
  ) {
    index.set(key, { tuition, score, sampleCount });
  }
}

async function listAirtableRecords(
  table: string,
  params: Record<string, string | string[]>,
): Promise<AirtableRecord[]> {
  const token = airtableToken();
  if (!token) {
    throw new Error("缺少 AIRTABLE_API_TOKEN");
  }
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams();
    query.set("pageSize", "100");
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          query.append(key, item);
        }
      } else if (value) {
        query.set(key, value);
      }
    }
    if (offset) {
      query.set("offset", offset);
    }
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${table}?${query}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const payload = (await response.json()) as {
      records?: AirtableRecord[];
      offset?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `Airtable ${response.status}`);
    }
    out.push(...(payload.records ?? []));
    offset = payload.offset;
    if (!offset) {
      break;
    }
  }
  return out;
}

function modeAmount(amounts: number[]): number | null {
  if (amounts.length === 0) {
    return null;
  }
  const counts = new Map<number, number>();
  for (const amount of amounts) {
    counts.set(amount, (counts.get(amount) ?? 0) + 1);
  }
  let best = amounts[0];
  let bestCount = 0;
  for (const [amount, count] of counts) {
    if (count > bestCount || (count === bestCount && amount > best)) {
      best = amount;
      bestCount = count;
    }
  }
  return best;
}

async function loadTuitionIndex(): Promise<CacheEntry> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return cache;
  }
  if (!airtableToken()) {
    cache = { at: now, byLocalName: new Map(), error: "未設定 Airtable" };
    return cache;
  }

  try {
    const [students, appointments] = await Promise.all([
      listAirtableRecords(STUDENT_TABLE, {
        "fields[]": ["Full_Name", "Student_Name"],
      }),
      listAirtableRecords(APPOINTMENT_TABLE, {
        filterByFormula:
          "AND(NOT({Canceled}), {Appointment Price}>0, FIND('Personal Training', {Type}), IS_AFTER({Start Time}, DATEADD(TODAY(), -180, 'days')))",
        "fields[]": [
          "Student",
          "Appointment Price",
          "Certificate Code",
          "Type",
        ],
        "sort[0][field]": "Start Time",
        "sort[0][direction]": "desc",
      }),
    ]);

    const pricesByStudentId = new Map<string, { open: number[]; all: number[] }>();
    for (const appointment of appointments) {
      const studentIds = appointment.fields.Student;
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        continue;
      }
      const price = Number(appointment.fields["Appointment Price"]);
      if (!Number.isFinite(price) || price <= 0) {
        continue;
      }
      const hasCert = Boolean(appointment.fields["Certificate Code"]);
      for (const studentId of studentIds) {
        if (typeof studentId !== "string") {
          continue;
        }
        const bucket = pricesByStudentId.get(studentId) ?? { open: [], all: [] };
        bucket.all.push(price);
        if (!hasCert) {
          bucket.open.push(price);
        }
        pricesByStudentId.set(studentId, bucket);
      }
    }

    const indexed = new Map<string, IndexedTuition>();
    for (const student of students) {
      const display =
        fieldString(student.fields, "Full_Name") ||
        fieldString(student.fields, "Student_Name");
      if (!display) {
        continue;
      }
      const bucket = pricesByStudentId.get(student.id);
      const samples = bucket?.open?.length ? bucket.open : bucket?.all ?? [];
      const tuition = modeAmount(samples);
      if (tuition == null) {
        continue;
      }
      const keys = new Set(
        [display, normalizeName(display), ...aliasKeys(display)].filter(
          (value): value is string => Boolean(value),
        ),
      );
      for (const key of keys) {
        putIndexedTuition(indexed, key, tuition, display, samples.length);
        putIndexedTuition(
          indexed,
          normalizeName(key),
          tuition,
          display,
          samples.length,
        );
      }
    }

    const byLocalName = new Map<string, number>();
    for (const [key, value] of indexed) {
      byLocalName.set(key, value.tuition);
    }

    cache = { at: now, byLocalName, error: null };
    return cache;
  } catch (error) {
    console.error("[loadTuitionIndex]", { error });
    cache = {
      at: now,
      byLocalName: new Map(),
      error: "無法讀取 Airtable 學費",
    };
    return cache;
  }
}

function resolveTuition(
  index: Map<string, number>,
  name: string,
): number | undefined {
  const exact = index.get(name) ?? index.get(normalizeName(name));
  if (exact != null) {
    return exact;
  }
  const keys = aliasKeys(name);
  const dedicated = keys.find(
    (key) => normalizeName(key) === normalizeName(name),
  );
  if (dedicated) {
    return index.get(dedicated) ?? index.get(normalizeName(dedicated));
  }
  const specificFirst = [...keys].sort((a, b) => b.length - a.length);
  for (const key of specificFirst) {
    const amount = index.get(key) ?? index.get(normalizeName(key));
    if (amount != null) {
      return amount;
    }
  }
  return undefined;
}

export async function lookupAirtableTuitions(
  names: string[],
): Promise<{ fees: Map<string, number>; error: string | null }> {
  const index = await loadTuitionIndex();
  const fees = new Map<string, number>();
  for (const name of names) {
    const tuition = resolveTuition(index.byLocalName, name);
    if (tuition != null) {
      fees.set(name, tuition);
    }
  }
  return { fees, error: index.error };
}

export async function lookupAirtableTuition(
  name: string | null | undefined,
): Promise<number | null> {
  if (!name) {
    return null;
  }
  const { fees } = await lookupAirtableTuitions([name]);
  return fees.get(name) ?? null;
}
