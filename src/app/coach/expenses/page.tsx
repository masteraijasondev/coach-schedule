import { ExpenseClaimForm } from "@/components/expense-claim-form";
import { ExpensePeriodNav } from "@/components/expense-period-nav";
import { Panel } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { parsePayrollPeriodParam, payrollPeriodLabel } from "@/lib/calendar";
import { googleDriveConfigured } from "@/lib/google-drive";
import { formatMoney } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ month?: string }>;
};

type ClaimRow = {
  id: string;
  amount_hkd: number | null;
  note: string | null;
  status: string;
  drive_folder_url: string | null;
};

type FileRow = {
  id: string;
  claim_id: string;
  file_name: string;
  storage_path: string | null;
};

export default async function CoachExpensesPage({ searchParams }: Props) {
  const coach = await requireCoach();
  const params = await searchParams;
  const period = parsePayrollPeriodParam(params.month);
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase
    .from("expense_claims")
    .select("id, amount_hkd, note, status, drive_folder_url")
    .eq("coach_id", coach.id)
    .eq("period", period)
    .order("created_at", { ascending: true });
  if (claimsError) {
    console.error("[CoachExpensesPage] claims", { error: claimsError, coachId: coach.id, period });
  }
  const claimRows = (claims ?? []) as ClaimRow[];
  const claimIds = claimRows.map((claim) => claim.id);
  const { data: files, error: filesError } = claimIds.length
    ? await supabase
        .from("expense_claim_files")
        .select("id, claim_id, file_name, storage_path")
        .in("claim_id", claimIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (filesError) {
    console.error("[CoachExpensesPage] files", { error: filesError, coachId: coach.id, period });
  }

  const draft = claimRows.find((claim) => claim.status === "draft") ?? null;
  const submitted = claimRows.filter((claim) => claim.status === "submitted");
  const admin = createAdminClient();
  const receipts = await Promise.all(
    ((files ?? []) as FileRow[]).map(async (file) => {
      let previewUrl: string | null = null;
      if (file.storage_path && draft?.id === file.claim_id) {
        const { data, error } = await admin.storage
          .from("expense-receipts")
          .createSignedUrl(file.storage_path, 60 * 60);
        if (error) {
          console.error("[CoachExpensesPage] signed url", { error, fileId: file.id });
        } else {
          previewUrl = data.signedUrl;
        }
      }
      return {
        id: file.id,
        claimId: file.claim_id,
        fileName: file.file_name,
        previewUrl,
      };
    }),
  );
  const draftReceipts = receipts.filter((receipt) => receipt.claimId === draft?.id);

  return (
    <div className="space-y-6">
      <Panel title={`報銷 · ${period}`}>
        <ExpensePeriodNav basePath="/coach/expenses" period={period} />
        <p className="text-sm text-stone-500">
          結算期：{payrollPeriodLabel(period)}。已提交的報銷不能再改，同一結算期可以再交另一張。
        </p>
        {claimsError ? (
          <p className="text-sm text-red-700" role="alert">
            讀取報銷失敗
          </p>
        ) : (
          <>
            {submitted.map((claim) => (
              <div key={claim.id} className="space-y-2 border-t border-stone-100 pt-3 text-sm">
                <p className="font-medium">已提交，不能再修改。</p>
                <p>金額：{formatMoney(Number(claim.amount_hkd ?? 0))}</p>
                {claim.note ? <p>備註：{claim.note}</p> : null}
                {claim.drive_folder_url ? (
                  <a
                    href={claim.drive_folder_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline"
                  >
                    開啟 Google Drive 資料夾
                  </a>
                ) : null}
                {receipts.some((receipt) => receipt.claimId === claim.id) ? (
                  <ul className="list-disc pl-5 text-stone-600">
                    {receipts
                      .filter((receipt) => receipt.claimId === claim.id)
                      .map((receipt) => (
                        <li key={receipt.id}>{receipt.fileName}</li>
                      ))}
                  </ul>
                ) : null}
              </div>
            ))}
            {submitted.length > 0 ? (
              <p className="border-t border-stone-100 pt-3 text-sm font-medium">另一張報銷</p>
            ) : null}
            <ExpenseClaimForm
              key={`${period}:${draft?.id ?? "new"}:${draftReceipts.length}`}
              period={period}
              initialAmount={
                draft?.amount_hkd == null ? "" : String(Number(draft.amount_hkd))
              }
              initialNote={draft?.note ?? ""}
              receipts={draftReceipts}
              driveReady={googleDriveConfigured()}
            />
          </>
        )}
      </Panel>
    </div>
  );
}
