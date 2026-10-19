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

export default async function CoachExpensesPage({ searchParams }: Props) {
  const coach = await requireCoach();
  const params = await searchParams;
  const period = parsePayrollPeriodParam(params.month);
  const supabase = await createClient();
  const { data: claim } = await supabase
    .from("expense_claims")
    .select("id, amount_hkd, note, status, drive_folder_url, submitted_at")
    .eq("coach_id", coach.id)
    .eq("period", period)
    .maybeSingle();
  const { data: files } = claim
    ? await supabase
        .from("expense_claim_files")
        .select("id, file_name, storage_path")
        .eq("claim_id", claim.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  const admin = createAdminClient();
  const receipts = await Promise.all(
    (files ?? []).map(async (file) => {
      let previewUrl: string | null = null;
      if (file.storage_path && claim?.status === "draft") {
        const { data, error } = await admin.storage
          .from("expense-receipts")
          .createSignedUrl(file.storage_path, 60 * 60);
        if (error) {
          console.error("[CoachExpensesPage] signed url", { error, fileId: file.id });
        } else {
          previewUrl = data.signedUrl;
        }
      }
      return { id: file.id, fileName: file.file_name, previewUrl };
    }),
  );
  const submittedClaim = claim?.status === "submitted" ? claim : null;

  return (
    <div className="space-y-6">
      <Panel title={`報銷 · ${period}`}>
        <ExpensePeriodNav basePath="/coach/expenses" period={period} />
        <p className="text-sm text-stone-500">
          結算期：{payrollPeriodLabel(period)}。未提交的結算期可以隨時補交。
        </p>
        {submittedClaim ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium">已提交，不能再修改。</p>
            <p>金額：{formatMoney(Number(submittedClaim.amount_hkd ?? 0))}</p>
            {submittedClaim.note ? <p>備註：{submittedClaim.note}</p> : null}
            {submittedClaim.drive_folder_url ? (
              <a
                href={submittedClaim.drive_folder_url}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline"
              >
                開啟 Google Drive 資料夾
              </a>
            ) : null}
            {receipts.length > 0 ? (
              <ul className="list-disc pl-5 text-stone-600">
                {receipts.map((receipt) => (
                  <li key={receipt.id}>{receipt.fileName}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <ExpenseClaimForm
            key={`${period}:${claim?.id ?? "new"}:${receipts.length}`}
            period={period}
            initialAmount={
              claim?.amount_hkd == null ? "" : String(Number(claim.amount_hkd))
            }
            initialNote={claim?.note ?? ""}
            receipts={receipts}
            driveReady={googleDriveConfigured()}
          />
        )}
      </Panel>
    </div>
  );
}
