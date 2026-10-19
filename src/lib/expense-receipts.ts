const RECEIPT_TYPES = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
  ["application/pdf", "pdf"],
]);

const EXTENSION_TYPES = new Map<string, string>([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["heic", "image/heic"],
  ["heif", "image/heif"],
  ["pdf", "application/pdf"],
]);

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
export const MAX_RECEIPTS = 30;

export function receiptMimeType(fileName: string, reportedType: string): string | null {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const fromExtension = EXTENSION_TYPES.get(extension);
  if (fromExtension) {
    return fromExtension;
  }
  return RECEIPT_TYPES.has(reportedType) ? reportedType : null;
}

export function safeFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop()?.trim() || "receipt";
  return base.replace(/[^\w.\- ()\u4e00-\u9fff]+/g, "_").slice(0, 120);
}
