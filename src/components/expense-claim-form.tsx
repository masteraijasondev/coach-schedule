"use client";

import {
  addExpenseReceiptAction,
  removeExpenseReceiptAction,
  saveExpenseDraftAction,
  submitExpenseClaimAction,
} from "@/actions/expenses";
import { ActionForm } from "@/components/action-form";
import { buttonTone } from "@/components/button-styles";
import { ServerActionButton } from "@/components/server-action-button";
import { SubmitButton } from "@/components/ui";
import { useState } from "react";

export type ExpenseReceipt = {
  id: string;
  fileName: string;
  previewUrl: string | null;
};

export function ExpenseClaimForm({
  period,
  initialAmount,
  initialNote,
  receipts,
  driveReady,
}: {
  period: string;
  initialAmount: string;
  initialNote: string;
  receipts: ExpenseReceipt[];
  driveReady: boolean;
}) {
  const [amount, setAmount] = useState(initialAmount);
  const [note, setNote] = useState(initialNote);
  const [draftError, setDraftError] = useState<string | null>(null);
  const canSubmit = amount.trim() !== "" && receipts.length > 0 && driveReady;

  async function saveDraft() {
    const formData = new FormData();
    formData.set("period", period);
    formData.set("amount_hkd", amount);
    formData.set("note", note);
    const result = await saveExpenseDraftAction(null, formData);
    setDraftError(result.ok ? null : result.error);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        輸入金額並加入收據後才可以提交。提交後會上傳到 Google Drive，此結算期不能再改。
      </p>
      {!driveReady ? (
        <p className="text-sm text-amber-800" role="status">
          尚未設定 Google Drive，可以先儲存收據，但暫時未能提交。
        </p>
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
        <p className="text-sm text-red-700" role="alert">
          {draftError}
        </p>
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
        successMessage="已加入收據"
      >
        <input type="hidden" name="period" value={period} />
        <input type="hidden" name="amount_hkd" value={amount} />
        <input type="hidden" name="note" value={note} />
        <label className="block min-w-0 flex-1 space-y-1 text-sm">
          <span className="text-stone-700">收據（JPEG、PNG、HEIC 或 PDF，10MB 內）</span>
          <input
            name="receipt"
            type="file"
            required
            accept="image/jpeg,image/png,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.heic,.heif,.pdf"
            className="block w-full text-sm text-stone-700"
          />
        </label>
        <SubmitButton>加入收據</SubmitButton>
      </ActionForm>
      <ActionForm action={submitExpenseClaimAction} className="space-y-3" successMessage="已提交到 Google Drive">
        <input type="hidden" name="period" value={period} />
        <input type="hidden" name="amount_hkd" value={amount} />
        <input type="hidden" name="note" value={note} />
        <SubmitButton disabled={!canSubmit}>提交到 Google Drive</SubmitButton>
      </ActionForm>
    </div>
  );
}
