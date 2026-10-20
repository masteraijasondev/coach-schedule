const FOLDER_MIME = "application/vnd.google-apps.folder";

type DriveConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderId: string;
};

export function googleDriveConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID &&
      process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN &&
      process.env.GOOGLE_DRIVE_FOLDER_ID,
  );
}

function driveConfig(): DriveConfig | null {
  if (!googleDriveConfigured()) {
    return null;
  }
  return {
    clientId: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
    refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN ?? "",
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID ?? "",
  };
}

async function accessToken(config: DriveConfig): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    console.error("[googleDrive] token", { status: response.status, error: payload.error });
    throw new Error("Google Drive 登入失敗");
  }
  return payload.access_token;
}

function escapeQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolder(
  token: string,
  name: string,
  parentId: string,
): Promise<string | null> {
  const query = [
    `name = '${escapeQuery(name)}'`,
    `'${parentId}' in parents`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false",
  ].join(" and ");
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", query);
  url.searchParams.set("fields", "files(id)");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = (await response.json()) as { files?: { id: string }[]; error?: { message: string } };
  if (!response.ok) {
    console.error("[googleDrive] find folder", { status: response.status, error: payload.error });
    throw new Error("讀取 Google Drive 資料夾失敗");
  }
  return payload.files?.[0]?.id ?? null;
}

async function createFolder(token: string, name: string, parentId: string): Promise<string> {
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        parents: [parentId],
      }),
    },
  );
  const payload = (await response.json()) as { id?: string; error?: { message: string } };
  if (!response.ok || !payload.id) {
    console.error("[googleDrive] create folder", { status: response.status, error: payload.error });
    throw new Error("建立 Google Drive 資料夾失敗");
  }
  return payload.id;
}

export async function ensureDriveFolder(name: string, parentId: string, token: string): Promise<string> {
  return (await findFolder(token, name, parentId)) ?? createFolder(token, name, parentId);
}

export async function uploadDriveFile(input: {
  token: string;
  folderId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<string> {
  const boundary = `expense-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: input.fileName,
    parents: [input.folderId],
  });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
    ),
    input.bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const payload = (await response.json()) as { id?: string; error?: { message: string } };
  if (!response.ok || !payload.id) {
    console.error("[googleDrive] upload", { status: response.status, error: payload.error });
    throw new Error("上傳收據到 Google Drive 失敗");
  }
  return payload.id;
}

export async function deleteDriveFile(token: string, fileId: string): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (response.status === 204 || response.status === 404) {
    return;
  }
  let detail = "";
  try {
    const payload = (await response.json()) as { error?: { message: string } };
    detail = payload.error?.message ?? "";
  } catch (error) {
    console.error("[googleDrive] delete parse", { error, fileId });
  }
  console.error("[googleDrive] delete", { status: response.status, fileId, detail });
  throw new Error("移除 Google Drive 收據失敗");
}

export async function driveAccessToken(): Promise<
  { ok: true; token: string; rootFolderId: string } | { ok: false; error: string }
> {
  const config = driveConfig();
  if (!config) {
    return { ok: false, error: "尚未設定 Google Drive，暫時未能提交" };
  }
  try {
    const token = await accessToken(config);
    return { ok: true, token, rootFolderId: config.folderId };
  } catch (error) {
    console.error("[googleDrive] access", { error });
    return { ok: false, error: "連接 Google Drive 失敗，請稍後再提交" };
  }
}

export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}
