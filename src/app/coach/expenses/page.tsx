import { Alert } from "@/components/alert";
import { ExpenseClaimForm, SubmittedExpenseClaim } from "@/components/expense-claim-form";
import { ExpensePeriodNav } from "@/components/expense-period-nav";
import { Panel } from "@/components/ui";
import { requireCoach } from "@/lib/auth";
import { parsePayrollPeriodParam, payrollPeriodLabel } from "@/lib/calendar";
import { driveFileUrl, googleDriveConfigured } from "@/lib/google-drive";
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
  submitted_at: string | null;
};

type FileRow = {
  id: string;
  claim_id: string;
  file_name: string;
  storage_path: string | null;
  drive_file_id: string | null;
};

export default async function CoachExpensesPage({ searchParams }: Props) {
  const coach = await requireCoach();
  const params = await searchParams;
  const period = parsePayrollPeriodParam(params.month);
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase
    .from("expense_claims")
    .select("id, amount_hkd, note, status, drive_folder_url, submitted_at")
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
        .select("id, claim_id, file_name, storage_path, drive_file_id")
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
      } else if (file.drive_file_id) {
        previewUrl = driveFileUrl(file.drive_file_id);
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
          結算期：{payrollPeriodLabel(period)}。已提交的報銷可以修改，上傳新收據會取代 Google Drive
          的舊檔。同一結算期可以再交另一張。
        </p>
        {claimsError ? (
          <Alert variant="filled" severity="error">讀取報銷失敗</Alert>
        ) : (
          <>
            {submitted.map((claim) => {
              const claimReceipts = receipts.filter((receipt) => receipt.claimId === claim.id);
              return (
                <SubmittedExpenseClaim
                  key={`${claim.id}:${claimReceipts.map((receipt) => receipt.id).join(",")}`}
                  period={period}
                  claimId={claim.id}
                  amount={claim.amount_hkd == null ? "" : String(Number(claim.amount_hkd))}
                  note={claim.note ?? ""}
                  receipts={claimReceipts}
                  driveReady={googleDriveConfigured()}
                  driveFolderUrl={claim.drive_folder_url}
                  submittedAt={claim.submitted_at}
                />
              );
            })}
            {submitted.length > 0 ? (
              <p className="border-t border-stone-100 pt-3 text-sm font-medium">新報銷</p>
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
