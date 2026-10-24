"use client";

import {
  addExpenseReceiptAction,
  removeExpenseReceiptAction,
  saveExpenseDraftAction,
  submitExpenseClaimAction,
} from "@/actions/expenses";
import { ActionForm } from "@/components/action-form";
import { Alert } from "@/components/alert";
import { buttonTone } from "@/components/button-styles";
import { ServerActionButton } from "@/components/server-action-button";
import { SubmitButton } from "@/components/ui";
import { formatDateTime, formatMoneyOrPending } from "@/lib/format";
import { useRef, useState } from "react";

export type ExpenseReceipt = {
  id: string;
  fileName: string;
  previewUrl: string | null;
};

export function SubmittedExpenseClaim({
  period,
  claimId,
  amount,
  note,
  receipts,
  driveReady,
  driveFolderUrl,
  submittedAt,
}: {
  period: string;
  claimId: string;
  amount: string;
  note: string;
  receipts: ExpenseReceipt[];
  driveReady: boolean;
  driveFolderUrl: string | null;
  submittedAt: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const amountLabel = amount.trim() === "" ? formatMoneyOrPending(null) : formatMoneyOrPending(Number(amount));

  return (
    <div className="border-t border-stone-100 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{amountLabel}</p>
          {submittedAt ? (
            <p className="mt-1 text-sm text-stone-500">提交時間：{formatDateTime(submittedAt)}</p>
          ) : null}
          {note.trim() !== "" ? <p className="mt-1 text-sm text-stone-600">{note}</p> : null}
          {receipts.length > 0 ? (
            <ul className="mt-1">
              {receipts.map((receipt) => (
                <li key={receipt.id} className="truncate text-sm">
                  {receipt.previewUrl ? (
                    <a
                      href={receipt.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline"
                    >
                      {receipt.fileName}
                    </a>
                  ) : (
                    <span className="font-medium">{receipt.fileName}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-stone-500">沒有收據</p>
          )}
          {driveFolderUrl ? (
            <a
              href={driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-sm font-medium underline"
            >
              開啟 Google Drive 資料夾
            </a>
          ) : null}
        </div>
        <button
          type="button"
          className={buttonTone.secondary}
          onClick={() => setEditing((current) => !current)}
        >
          {editing ? "收起" : "修改"}
        </button>
      </div>
      {editing ? (
        <div className="mt-4">
          <ExpenseClaimForm
            period={period}
            claimId={claimId}
            submitted
            initialAmount={amount}
            initialNote={note}
            receipts={receipts}
            driveReady={driveReady}
            driveFolderUrl={driveFolderUrl}
          />
        </div>
      ) : null}
    </div>
  );
}

export function ExpenseClaimForm({
  period,
  claimId = null,
  submitted = false,
  initialAmount,
  initialNote,
  receipts,
  driveReady,
  driveFolderUrl = null,
}: {
  period: string;
  claimId?: string | null;
  submitted?: boolean;
  initialAmount: string;
  initialNote: string;
  receipts: ExpenseReceipt[];
  driveReady: boolean;
  driveFolderUrl?: string | null;
}) {
  const [amount, setAmount] = useState(initialAmount);
  const [note, setNote] = useState(initialNote);
  const [receiptName, setReceiptName] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const canSubmit = amount.trim() !== "" && receipts.length > 0 && driveReady;

  async function saveDraft() {
    const formData = new FormData();
    formData.set("period", period);
    formData.set("amount_hkd", amount);
    formData.set("note", note);
    if (claimId) {
      formData.set("claim_id", claimId);
    }
    const result = await saveExpenseDraftAction(null, formData);
    setDraftError(result.ok ? null : result.error);
  }

  return (
    <div className="space-y-4">
      {submitted ? <p className="text-sm font-medium">已提交</p> : null}
      <p className="text-sm text-stone-500">
        {submitted
          ? "可以修改金額和備註。上傳新收據會取代這張報銷在 Google Drive 的全部舊收據。"
          : "輸入金額並加入收據後才可以提交。同一結算期可以再交另一張。"}
      </p>
      {driveFolderUrl ? (
        <a
          href={driveFolderUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sm font-medium underline"
        >
          開啟 Google Drive 資料夾
        </a>
      ) : null}
      {!driveReady ? (
        <Alert variant="filled" severity="warning">
          {submitted
            ? "尚未設定 Google Drive，暫時未能更換收據。"
            : "尚未設定 Google Drive，可以先儲存收據，但暫時未能提交。"}
        </Alert>
      ) : null}
      <label className="block space-y-1 text-sm">
        <span className="text-stone-700">金額（港幣）</span>
        <input
          value={amount}
          onChange={(event) => setAmount(event.currentTarget.value)}
          onBlur={() => {
            void saveDraft();
          }}
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-stone-700">備註（可留空）</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          onBlur={() => {
            void saveDraft();
          }}
          rows={3}
          maxLength={500}
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-500"
        />
      </label>
      {draftError ? (
        <Alert variant="filled" severity="error">{draftError}</Alert>
      ) : null}
      <ul className="divide-y divide-stone-100">
        {receipts.map((receipt) => (
          <li key={receipt.id} className="flex items-center justify-between gap-3 py-2">
            {receipt.previewUrl ? (
              <a
                href={receipt.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate text-sm font-medium underline"
              >
                {receipt.fileName}
              </a>
            ) : (
              <p className="min-w-0 truncate text-sm font-medium">{receipt.fileName}</p>
            )}
            <ServerActionButton
              action={() => removeExpenseReceiptAction(receipt.id)}
              className={buttonTone.secondary}
              confirmMessage={submitted ? "這會從 Google Drive 移除這張收據。" : undefined}
              confirmLabel="移除"
            >
              移除
            </ServerActionButton>
          </li>
        ))}
        {receipts.length === 0 ? (
          <li className="py-2 text-sm text-stone-500">尚未加入收據</li>
        ) : null}
      </ul>
      <ActionForm
        action={addExpenseReceiptAction}
        encType="multipart/form-data"
        className="flex flex-wrap items-end gap-3"
        successMessage={submitted ? "已更換 Google Drive 收據" : "已加入收據"}
      >
        <input type="hidden" name="period" value={period} />
        {claimId ? <input type="hidden" name="claim_id" value={claimId} /> : null}
        <input type="hidden" name="amount_hkd" value={amount} />
        <input type="hidden" name="note" value={note} />
        <label className="block min-w-0 flex-1 space-y-1 text-sm">
          <span className="text-stone-700">收據（JPEG、PNG、HEIC 或 PDF，10MB 內）</span>
          <span className="relative flex flex-wrap items-center gap-3">
            <input
              ref={receiptInputRef}
              name="receipt"
              type="file"
              required
              accept="image/jpeg,image/png,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.heic,.heif,.pdf"
              className="absolute h-px w-px overflow-hidden opacity-0"
              onChange={(event) => {
                setReceiptName(event.currentTarget.files?.[0]?.name ?? "");
              }}
            />
            <button
              type="button"
              className={buttonTone.primary}
              onClick={() => receiptInputRef.current?.click()}
            >
              選擇檔案
            </button>
            <span className="min-w-0 truncate text-sm font-medium text-stone-900">
              {receiptName || "尚未選擇"}
            </span>
          </span>
        </label>
        <SubmitButton disabled={submitted && !driveReady}>
          {submitted ? "更換收據" : "加入收據"}
        </SubmitButton>
      </ActionForm>
      {submitted ? null : (
        <ActionForm action={submitExpenseClaimAction} className="space-y-3" successMessage="已提交到 Google Drive">
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="amount_hkd" value={amount} />
          <input type="hidden" name="note" value={note} />
          <SubmitButton disabled={!canSubmit}>提交到 Google Drive</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
