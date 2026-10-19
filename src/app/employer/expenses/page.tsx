import { ExpensePeriodNav } from "@/components/expense-period-nav";
import { Panel } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import { parsePayrollPeriodParam, payrollPeriodLabel } from "@/lib/calendar";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ month?: string }>;
};

export default async function EmployerExpensesPage({ searchParams }: Props) {
  await requireEmployer();
  const params = await searchParams;
  const period = parsePayrollPeriodParam(params.month);
  const supabase = await createClient();
  const [{ data: coaches }, { data: claims }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "coach")
      .eq("active", true)
      .order("full_name"),
    supabase
      .from("expense_claims")
      .select("coach_id, amount_hkd, note, drive_folder_url")
      .eq("period", period)
      .eq("status", "submitted"),
  ]);
  const claimByCoach = new Map((claims ?? []).map((claim) => [claim.coach_id, claim]));

  return (
    <div className="space-y-6">
      <Panel title={`報銷 · ${period}`}>
        <ExpensePeriodNav basePath="/employer/expenses" period={period} />
        <p className="mb-3 text-sm text-stone-500">
          結算期：{payrollPeriodLabel(period)}。未提交的同事只會顯示「未提交」。
        </p>
        <ul className="divide-y divide-stone-100">
          {(coaches ?? []).map((person) => {
            const claim = claimByCoach.get(person.id);
            return (
              <li key={person.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{person.full_name}</p>
                  {claim?.note ? (
                    <p className="mt-1 text-sm text-stone-600">{claim.note}</p>
                  ) : null}
                  {claim?.drive_folder_url ? (
                    <a
                      href={claim.drive_folder_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-sm font-medium underline"
                    >
                      Google Drive
                    </a>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm font-medium">
                  {claim ? formatMoney(Number(claim.amount_hkd ?? 0)) : "未提交"}
                </p>
              </li>
            );
          })}
          {(coaches ?? []).length === 0 ? (
            <li className="py-3 text-sm text-stone-500">沒有帳號</li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
