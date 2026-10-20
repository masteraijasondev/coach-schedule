"use server";

import {
  MAX_RECEIPT_BYTES,
  MAX_RECEIPTS,
  receiptMimeType,
  safeFileName,
} from "@/lib/expense-receipts";
import {
  deleteDriveFile,
  driveAccessToken,
  driveFolderUrl,
  ensureDriveFolder,
  uploadDriveFile,
} from "@/lib/google-drive";
import { payrollPeriodLabel } from "@/lib/calendar";
import { requireCoach } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";
import { revalidatePath } from "next/cache";

const RECEIPT_BUCKET = "expense-receipts";

type ClaimRow = {
  id: string;
  coach_id: string;
  period: string;
  amount_hkd: number | null;
  note: string | null;
  status: string;
  drive_folder_id: string | null;
};

type FileRow = {
  id: string;
  file_name: string;
  mime_type: string;
  storage_path: string | null;
  drive_file_id: string | null;
};

function parsePeriod(raw: string): string | null {
  return /^\d{4}-\d{2}$/.test(raw) ? raw : null;
}

function parseAmount(raw: string): number | null {
  if (raw.trim() === "") {
    return null;
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount * 100) / 100;
}

function revalidateExpenses() {
  revalidatePath("/coach/expenses");
  revalidatePath("/employer/expenses");
}

async function ownDraft(
  coachId: string,
  period: string,
): Promise<{ ok: true; claim: ClaimRow | null } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("expense_claims")
    .select("id, coach_id, period, amount_hkd, note, status, drive_folder_id")
    .eq("coach_id", coachId)
    .eq("period", period)
    .eq("status", "draft")
    .maybeSingle();
  if (error) {
    console.error("[expenseClaim] load", { error, coachId, period });
    return { ok: false, error: "讀取報銷失敗" };
  }
  return { ok: true, claim: (data as ClaimRow | null) ?? null };
}

async function ensureDraft(
  coachId: string,
  period: string,
  amount: number | null,
  note: string | null,
): Promise<{ ok: true; claim: ClaimRow } | { ok: false; error: string }> {
  const existing = await ownDraft(coachId, period);
  if (!existing.ok) {
    return existing;
  }
  const admin = createAdminClient();
  if (!existing.claim) {
    const { data, error } = await admin
      .from("expense_claims")
      .insert({
        coach_id: coachId,
        period,
        amount_hkd: amount,
        note,
        status: "draft",
      })
      .select("id, coach_id, period, amount_hkd, note, status, drive_folder_id")
      .single();
    if (error || !data) {
      console.error("[expenseClaim] create", { error, coachId, period });
      return { ok: false, error: "建立報銷失敗" };
    }
    return { ok: true, claim: data as ClaimRow };
  }
  const { data, error } = await admin
    .from("expense_claims")
    .update({
      amount_hkd: amount ?? existing.claim.amount_hkd,
      note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.claim.id)
    .eq("status", "draft")
    .select("id, coach_id, period, amount_hkd, note, status, drive_folder_id")
    .single();
  if (error || !data) {
    console.error("[expenseClaim] update", { error, claimId: existing.claim.id });
    return { ok: false, error: "儲存報銷失敗" };
  }
  return { ok: true, claim: data as ClaimRow };
}

async function ownClaim(
  coachId: string,
  claimId: string,
): Promise<{ ok: true; claim: ClaimRow } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("expense_claims")
    .select("id, coach_id, period, amount_hkd, note, status, drive_folder_id")
    .eq("id", claimId)
    .eq("coach_id", coachId)
    .maybeSingle();
  if (error) {
    console.error("[expenseClaim] load by id", { error, coachId, claimId });
    return { ok: false, error: "讀取報銷失敗" };
  }
  if (!data) {
    return { ok: false, error: "找不到報銷" };
  }
  return { ok: true, claim: data as ClaimRow };
}

async function saveClaimFields(
  claim: ClaimRow,
  amount: number | null,
  note: string | null,
): Promise<ActionResult> {
  const nextAmount = claim.status === "submitted" ? amount : (amount ?? claim.amount_hkd);
  if (claim.status === "submitted" && nextAmount == null) {
    return { ok: false, error: "請輸入大於 0 的金額" };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("expense_claims")
    .update({
      amount_hkd: nextAmount,
      note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", claim.id)
    .eq("coach_id", claim.coach_id);
  if (error) {
    console.error("[expenseClaim] update fields", { error, claimId: claim.id });
    return { ok: false, error: "儲存報銷失敗" };
  }
  return { ok: true, data: undefined };
}

async function ensureClaimFolder(
  claim: ClaimRow,
  coachName: string,
  token: string,
  rootFolderId: string,
): Promise<{ ok: true; folderId: string } | { ok: false; error: string }> {
  if (claim.drive_folder_id) {
    return { ok: true, folderId: claim.drive_folder_id };
  }
  let folderId: string;
  try {
    const periodFolderId = await ensureDriveFolder(
      `${claim.period} ${payrollPeriodLabel(claim.period)}`,
      rootFolderId,
      token,
    );
    folderId = await ensureDriveFolder(coachName, periodFolderId, token);
  } catch (error) {
    console.error("[expenseClaim] folder", { error, claimId: claim.id });
    return { ok: false, error: "建立 Google Drive 資料夾失敗，請再提交" };
  }
  const admin = createAdminClient();
  const { error: folderError } = await admin
    .from("expense_claims")
    .update({
      drive_folder_id: folderId,
      drive_folder_url: driveFolderUrl(folderId),
      updated_at: new Date().toISOString(),
    })
    .eq("id", claim.id);
  if (folderError) {
    console.error("[expenseClaim] save folder", { error: folderError, claimId: claim.id });
    return { ok: false, error: "儲存 Google Drive 資料夾失敗，請再提交" };
  }
  return { ok: true, folderId };
}

async function replaceSubmittedReceipt(input: {
  coachName: string;
  claim: ClaimRow;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  amount: number;
  note: string | null;
}): Promise<ActionResult> {
  const saved = await saveClaimFields(input.claim, input.amount, input.note);
  if (!saved.ok) {
    return saved;
  }
  const access = await driveAccessToken();
  if (!access.ok) {
    revalidateExpenses();
    return access;
  }
  const folder = await ensureClaimFolder(
    input.claim,
    input.coachName,
    access.token,
    access.rootFolderId,
  );
  if (!folder.ok) {
    revalidateExpenses();
    return folder;
  }
  const admin = createAdminClient();
  const { data: existing, error: filesError } = await admin
    .from("expense_claim_files")
    .select("id, storage_path, drive_file_id")
    .eq("claim_id", input.claim.id);
  if (filesError) {
    console.error("[replaceSubmittedReceipt] files", { error: filesError, claimId: input.claim.id });
    revalidateExpenses();
    return { ok: false, error: "讀取收據失敗" };
  }
  let driveFileId: string;
  try {
    driveFileId = await uploadDriveFile({
      token: access.token,
      folderId: folder.folderId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      bytes: input.bytes,
    });
  } catch (error) {
    console.error("[replaceSubmittedReceipt] upload", { error, claimId: input.claim.id });
    revalidateExpenses();
    return { ok: false, error: "上傳到 Google Drive 失敗" };
  }
  const fileId = crypto.randomUUID();
  const { error: insertError } = await admin.from("expense_claim_files").insert({
    id: fileId,
    claim_id: input.claim.id,
    file_name: input.fileName,
    mime_type: input.mimeType,
    storage_path: null,
    drive_file_id: driveFileId,
  });
  if (insertError) {
    console.error("[replaceSubmittedReceipt] insert", { error: insertError, claimId: input.claim.id });
    try {
      await deleteDriveFile(access.token, driveFileId);
    } catch (error) {
      console.error("[replaceSubmittedReceipt] rollback upload", { error, driveFileId });
    }
    revalidateExpenses();
    return { ok: false, error: "儲存收據失敗" };
  }
  const oldFiles = (existing ?? []) as {
    id: string;
    storage_path: string | null;
    drive_file_id: string | null;
  }[];
  let leftover = false;
  for (const old of oldFiles) {
    if (old.drive_file_id) {
      try {
        await deleteDriveFile(access.token, old.drive_file_id);
      } catch (error) {
        console.error("[replaceSubmittedReceipt] delete old", { error, fileId: old.id });
        leftover = true;
        continue;
      }
    }
    if (old.storage_path) {
      const { error: storageError } = await admin.storage
        .from(RECEIPT_BUCKET)
        .remove([old.storage_path]);
      if (storageError) {
        console.error("[replaceSubmittedReceipt] storage", { error: storageError, fileId: old.id });
      }
    }
    const { error: deleteError } = await admin.from("expense_claim_files").delete().eq("id", old.id);
    if (deleteError) {
      console.error("[replaceSubmittedReceipt] delete row", { error: deleteError, fileId: old.id });
      leftover = true;
    }
  }
  revalidateExpenses();
  if (leftover) {
    return { ok: false, error: "新收據已上傳，但有舊收據未能從 Google Drive 移除" };
  }
  return { ok: true, data: undefined };
}

function fieldsFromForm(formData: FormData):
  | { ok: true; period: string; amount: number | null; note: string | null }
  | { ok: false; error: string } {
  const period = parsePeriod(String(formData.get("period") ?? ""));
  if (!period) {
    return { ok: false, error: "結算期無效" };
  }
  const amountRaw = String(formData.get("amount_hkd") ?? "");
  const amount = parseAmount(amountRaw);
  if (amountRaw.trim() !== "" && amount == null) {
    return { ok: false, error: "請輸入大於 0 的金額" };
  }
  const noteRaw = String(formData.get("note") ?? "").trim();
  return { ok: true, period, amount, note: noteRaw === "" ? null : noteRaw.slice(0, 500) };
}

export async function saveExpenseDraftAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const coach = await requireCoach();
    const fields = fieldsFromForm(formData);
    if (!fields.ok) {
      return fields;
    }
    const claimId = String(formData.get("claim_id") ?? "").trim();
    if (claimId) {
      const owned = await ownClaim(coach.id, claimId);
      if (!owned.ok) {
        return owned;
      }
      if (owned.claim.period !== fields.period) {
        return { ok: false, error: "結算期無效" };
      }
      const saved = await saveClaimFields(owned.claim, fields.amount, fields.note);
      if (!saved.ok) {
        return saved;
      }
      revalidateExpenses();
      return saved;
    }
    const saved = await ensureDraft(coach.id, fields.period, fields.amount, fields.note);
    if (!saved.ok) {
      return saved;
    }
    revalidateExpenses();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[saveExpenseDraftAction]", { error });
    return { ok: false, error: "儲存報銷失敗" };
  }
}

export async function addExpenseReceiptAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const coach = await requireCoach();
    const fields = fieldsFromForm(formData);
    if (!fields.ok) {
      return fields;
    }
    const file = formData.get("receipt");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "請選擇收據" };
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      return { ok: false, error: "收據不能超過 10MB" };
    }
    const mimeType = receiptMimeType(file.name, file.type);
    if (!mimeType) {
      return { ok: false, error: "收據只可以是 JPEG、PNG、HEIC 或 PDF" };
    }
    const fileName = safeFileName(file.name);
    const bytes = Buffer.from(await file.arrayBuffer());
    const claimId = String(formData.get("claim_id") ?? "").trim();
    if (claimId) {
      const owned = await ownClaim(coach.id, claimId);
      if (!owned.ok) {
        return owned;
      }
      if (owned.claim.period !== fields.period) {
        return { ok: false, error: "結算期無效" };
      }
      if (owned.claim.status === "submitted") {
        if (fields.amount == null) {
          return { ok: false, error: "請先輸入金額" };
        }
        return replaceSubmittedReceipt({
          coachName: coach.full_name,
          claim: owned.claim,
          fileName,
          mimeType,
          bytes,
          amount: fields.amount,
          note: fields.note,
        });
      }
    }
    const saved = await ensureDraft(coach.id, fields.period, fields.amount, fields.note);
    if (!saved.ok) {
      return saved;
    }
    const admin = createAdminClient();
    const { count, error: countError } = await admin
      .from("expense_claim_files")
      .select("id", { count: "exact", head: true })
      .eq("claim_id", saved.claim.id);
    if (countError) {
      console.error("[addExpenseReceiptAction] count", { error: countError });
      return { ok: false, error: "讀取收據失敗" };
    }
    if ((count ?? 0) >= MAX_RECEIPTS) {
      return { ok: false, error: `最多 ${MAX_RECEIPTS} 個收據` };
    }
    const fileId = crypto.randomUUID();
    const storagePath = `${coach.id}/${saved.claim.id}/${fileId}/${fileName}`;
    const { error: uploadError } = await admin.storage
      .from(RECEIPT_BUCKET)
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
    if (uploadError) {
      console.error("[addExpenseReceiptAction] storage", { error: uploadError });
      return { ok: false, error: "上載收據失敗" };
    }
    const { error: insertError } = await admin.from("expense_claim_files").insert({
      id: fileId,
      claim_id: saved.claim.id,
      file_name: fileName,
      mime_type: mimeType,
      storage_path: storagePath,
    });
    if (insertError) {
      console.error("[addExpenseReceiptAction] insert", { error: insertError });
      await admin.storage.from(RECEIPT_BUCKET).remove([storagePath]);
      return { ok: false, error: "儲存收據失敗" };
    }
    revalidateExpenses();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[addExpenseReceiptAction]", { error });
    return { ok: false, error: "上載收據失敗" };
  }
}

export async function removeExpenseReceiptAction(fileId: string): Promise<ActionResult> {
  try {
    const coach = await requireCoach();
    const admin = createAdminClient();
    const { data: file, error } = await admin
      .from("expense_claim_files")
      .select("id, claim_id, storage_path, drive_file_id, expense_claims(coach_id, status)")
      .eq("id", fileId)
      .maybeSingle();
    if (error || !file) {
      console.error("[removeExpenseReceiptAction] load", { error, fileId });
      return { ok: false, error: "找不到收據" };
    }
    const claim = Array.isArray(file.expense_claims)
      ? file.expense_claims[0]
      : file.expense_claims;
    if (!claim || claim.coach_id !== coach.id) {
      return { ok: false, error: "找不到收據" };
    }
    if (file.drive_file_id) {
      const access = await driveAccessToken();
      if (!access.ok) {
        return access;
      }
      try {
        await deleteDriveFile(access.token, file.drive_file_id);
      } catch (error) {
        console.error("[removeExpenseReceiptAction] drive", { error, fileId });
        return { ok: false, error: "未能從 Google Drive 移除收據" };
      }
    }
    if (file.storage_path) {
      const { error: storageError } = await admin.storage
        .from(RECEIPT_BUCKET)
        .remove([file.storage_path]);
      if (storageError) {
        console.error("[removeExpenseReceiptAction] storage", { error: storageError, fileId });
      }
    }
    const { error: deleteError } = await admin
      .from("expense_claim_files")
      .delete()
      .eq("id", fileId);
    if (deleteError) {
      console.error("[removeExpenseReceiptAction] delete", { error: deleteError, fileId });
      return { ok: false, error: "移除收據失敗" };
    }
    revalidateExpenses();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[removeExpenseReceiptAction]", { error });
    return { ok: false, error: "移除收據失敗" };
  }
}

export async function submitExpenseClaimAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const coach = await requireCoach();
    const fields = fieldsFromForm(formData);
    if (!fields.ok) {
      return fields;
    }
    if (fields.amount == null) {
      return { ok: false, error: "請先輸入金額" };
    }
    const saved = await ensureDraft(coach.id, fields.period, fields.amount, fields.note);
    if (!saved.ok) {
      return saved;
    }
    const admin = createAdminClient();
    const { data: files, error: filesError } = await admin
      .from("expense_claim_files")
      .select("id, file_name, mime_type, storage_path, drive_file_id")
      .eq("claim_id", saved.claim.id);
    if (filesError) {
      console.error("[submitExpenseClaimAction] files", { error: filesError });
      return { ok: false, error: "讀取收據失敗" };
    }
    const receipts = (files ?? []) as FileRow[];
    if (receipts.length === 0) {
      return { ok: false, error: "請先加入至少一張收據" };
    }
    const access = await driveAccessToken();
    if (!access.ok) {
      return access;
    }
    const folder = await ensureClaimFolder(
      saved.claim,
      coach.full_name,
      access.token,
      access.rootFolderId,
    );
    if (!folder.ok) {
      return folder;
    }
    const folderId = folder.folderId;
    for (const receipt of receipts) {
      if (receipt.drive_file_id || !receipt.storage_path) {
        continue;
      }
      const { data: blob, error: downloadError } = await admin.storage
        .from(RECEIPT_BUCKET)
        .download(receipt.storage_path);
      if (downloadError || !blob) {
        console.error("[submitExpenseClaimAction] download", { error: downloadError, fileId: receipt.id });
        return { ok: false, error: "讀取收據失敗，請再提交" };
      }
      try {
        const driveFileId = await uploadDriveFile({
          token: access.token,
          folderId,
          fileName: receipt.file_name,
          mimeType: receipt.mime_type,
          bytes: Buffer.from(await blob.arrayBuffer()),
        });
        const { error: markError } = await admin
          .from("expense_claim_files")
          .update({ drive_file_id: driveFileId })
          .eq("id", receipt.id);
        if (markError) {
          console.error("[submitExpenseClaimAction] mark file", { error: markError, fileId: receipt.id });
          return { ok: false, error: "儲存 Google Drive 收據失敗，請再提交" };
        }
      } catch (error) {
        console.error("[submitExpenseClaimAction] upload", { error, fileId: receipt.id });
        return { ok: false, error: "上傳到 Google Drive 失敗，請再提交" };
      }
    }
    const submittedAt = new Date().toISOString();
    const { error: submitError } = await admin
      .from("expense_claims")
      .update({
        status: "submitted",
        amount_hkd: fields.amount,
        note: fields.note,
        drive_folder_id: folderId,
        drive_folder_url: driveFolderUrl(folderId),
        submitted_at: submittedAt,
        updated_at: submittedAt,
      })
      .eq("id", saved.claim.id)
      .eq("status", "draft");
    if (submitError) {
      console.error("[submitExpenseClaimAction] lock", { error: submitError });
      return { ok: false, error: "提交失敗，請再試一次" };
    }
    const storagePaths = receipts
      .map((receipt) => receipt.storage_path)
      .filter((path): path is string => Boolean(path));
    if (storagePaths.length > 0) {
      const { error: removeError } = await admin.storage.from(RECEIPT_BUCKET).remove(storagePaths);
      if (removeError) {
        console.error("[submitExpenseClaimAction] cleanup", { error: removeError });
      } else {
        await admin
          .from("expense_claim_files")
          .update({ storage_path: null })
          .eq("claim_id", saved.claim.id);
      }
    }
    revalidateExpenses();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error("[submitExpenseClaimAction]", { error });
    return { ok: false, error: "提交失敗，請再試一次" };
  }
}
