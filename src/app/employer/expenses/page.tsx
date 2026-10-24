import { ExpensePeriodNav } from "@/components/expense-period-nav";
import { Panel } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import { parsePayrollPeriodParam, payrollPeriodLabel } from "@/lib/calendar";
import { DataValue, EmphasizedText } from "@/components/data-value";
import { formatDateTime, formatMoney } from "@/lib/format";
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
      .select("id, coach_id, amount_hkd, note, drive_folder_url, submitted_at")
      .eq("period", period)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true }),
  ]);
  const claimsByCoach = new Map<string, NonNullable<typeof claims>>();
  for (const claim of claims ?? []) {
    const list = claimsByCoach.get(claim.coach_id) ?? [];
    list.push(claim);
    claimsByCoach.set(claim.coach_id, list);
  }

  return (
    <div className="space-y-6">
      <Panel title={`報銷 · ${period}`}>
        <ExpensePeriodNav basePath="/employer/expenses" period={period} />
        <p className="mb-3 text-sm text-stone-500">
          結算期：{payrollPeriodLabel(period)}。同一結算期的每張報銷分開列出。未提交的同事只會顯示「未提交」。
        </p>
        <ul className="divide-y divide-stone-100">
          {(coaches ?? []).map((person) => {
            const personClaims = claimsByCoach.get(person.id) ?? [];
            return (
              <li key={person.id} className="py-3">
                <p className="font-medium">{person.full_name}</p>
                {personClaims.length === 0 ? (
                  <p className="mt-1 text-sm text-stone-500">未提交</p>
                ) : (
                  <ul className="mt-2 space-y-3">
                    {personClaims.map((claim) => (
                      <li key={claim.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {claim.submitted_at ? (
                            <p className="text-sm text-stone-700">
                              提交時間：
                              <EmphasizedText figure text={formatDateTime(claim.submitted_at)} />
                            </p>
                          ) : null}
                          {claim.note ? (
                            <p className="text-sm text-stone-600">{claim.note}</p>
                          ) : null}
                          {claim.drive_folder_url ? (
                            <a
                              href={claim.drive_folder_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block text-sm font-medium underline"
                            >
                              開啟 Google Drive 資料夾
                            </a>
                          ) : null}
                        </div>
                        <p className="shrink-0">
                          <DataValue figure>
                            {formatMoney(Number(claim.amount_hkd ?? 0))}
                          </DataValue>
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
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
