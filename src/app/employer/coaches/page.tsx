import {
  createCoachAction,
  deleteCoachAction,
  resetCoachPasswordAction,
  updateCoachNameAction,
} from "@/actions/coaches";
import { ActionForm } from "@/components/action-form";
import { EmployerPtRateForm } from "@/components/employer-pt-rate-form";
import { EmployerSettingsBackLink } from "@/components/employer-settings-back-link";
import { Field, Panel, SelectField, SubmitButton } from "@/components/ui";
import { lookupAirtableTuitions } from "@/lib/airtable-tuition";
import { requireEmployer } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import {
  coachPayFromFeeRatio,
  derivedPayRatio,
  formatPayRatioPercent,
} from "@/lib/pt-rate";
import { createClient } from "@/lib/supabase/server";

export default async function CoachesPage() {
  await requireEmployer();
  const supabase = await createClient();
  const tuitionWarm = lookupAirtableTuitions([]);
  const [{ data: coaches }, { data: students }, { data: studentRates }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name, staff_kind, must_change_password")
        .eq("role", "coach")
        .order("full_name"),
      supabase
        .from("students")
        .select("id, name")
        .eq("active", true)
        .order("name"),
      supabase
        .from("coach_student_rates")
        .select("coach_id, student_id, amount_hkd, student_fee_hkd, pay_ratio"),
    ]);
  await tuitionWarm;

  const studentName = new Map((students ?? []).map((s) => [s.id, s.name]));
  const coachName = new Map((coaches ?? []).map((c) => [c.id, c.full_name]));
  const { fees: listedTuitions, error: listedError } = await lookupAirtableTuitions(
    [...studentName.values()],
  );

  return (
    <div className="space-y-6">
      <EmployerSettingsBackLink />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="新增教練帳號">
          <ActionForm action={createCoachAction} className="space-y-3">
            <Field label="姓名" name="full_name" required />
            <SelectField
              label="職位"
              name="staff_kind"
              required
              defaultValue="coach"
              options={[
                { value: "coach", label: "教練" },
                { value: "operations", label: "營運人員" },
              ]}
            />
            <Field label="電郵" name="email" type="email" required />
            <Field
              label="臨時密碼"
              name="temp_password"
              type="password"
              minLength={8}
              required
            />
            <p className="text-xs text-stone-500">
              教練首次登入必須更改密碼。
            </p>
            <SubmitButton>建立帳號</SubmitButton>
          </ActionForm>
        </Panel>

        <Panel title="教練列表">
          <ul className="divide-y divide-stone-100">
            {(coaches ?? []).map((coach) => (
              <li key={coach.id} className="space-y-2 py-3">
                <ActionForm
                  action={updateCoachNameAction}
                  className="flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="coach_id" value={coach.id} />
                  <div className="min-w-0 flex-1">
                    <Field
                      label="姓名"
                      name="full_name"
                      defaultValue={coach.full_name}
                      required
                    />
                  </div>
                  <div className="w-44">
                    <SelectField
                      label="職位"
                      name="staff_kind"
                      required
                      defaultValue={
                        coach.staff_kind === "operations"
                          ? "operations"
                          : "coach"
                      }
                      options={[
                        { value: "coach", label: "教練" },
                        { value: "operations", label: "營運人員" },
                      ]}
                    />
                  </div>
                  <SubmitButton>更新</SubmitButton>
                </ActionForm>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-stone-500">{coach.email}</p>
                  {coach.must_change_password ? (
                    <span className="shrink-0 text-xs text-amber-700">
                      待更改密碼
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-stone-400">
                      已啟用
                    </span>
                  )}
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer text-stone-600">
                    重設密碼或刪除帳號
                  </summary>
                  <div className="mt-3 space-y-4">
                    <ActionForm
                      action={resetCoachPasswordAction}
                      className="space-y-3"
                    >
                      <input type="hidden" name="coach_id" value={coach.id} />
                      <Field
                        label="新密碼"
                        name="password"
                        type="password"
                        minLength={8}
                        required
                      />
                      <SelectField
                        label="登入後必須更改密碼"
                        name="must_change_password"
                        required
                        defaultValue="yes"
                        options={[
                          { value: "yes", label: "是" },
                          { value: "no", label: "否" },
                        ]}
                      />
                      <SubmitButton>重設密碼</SubmitButton>
                    </ActionForm>
                    <ActionForm
                      action={deleteCoachAction}
                      className="space-y-3"
                    >
                      <input type="hidden" name="coach_id" value={coach.id} />
                      <label className="flex items-center gap-2 text-sm text-stone-700">
                        <input
                          type="checkbox"
                          name="confirm_delete"
                          value="1"
                          required
                        />
                        確認刪除此帳號
                      </label>
                      <p className="text-xs text-stone-500">
                        有課堂紀錄的教練無法刪除。
                      </p>
                      <SubmitButton variant="danger">刪除帳號</SubmitButton>
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
            {(coaches ?? []).length === 0 ? (
              <li className="py-3 text-sm text-stone-500">尚未新增教練</li>
            ) : null}
          </ul>
        </Panel>
      </div>

      <Panel title="教練 PT 費率（分成比例）">
        {listedError ? (
          <p className="mb-3 text-sm text-amber-700">{listedError}</p>
        ) : (
          <p className="mb-3 text-sm text-stone-500">
            學生學費取自 Airtable 本身學費；教練薪資為學費乘以分成比例。此處僅可編輯分成比例。
          </p>
        )}
        <EmployerPtRateForm
          coaches={(coaches ?? []).map((coach) => ({
            id: coach.id,
            full_name: coach.full_name,
          }))}
          students={(students ?? []).map((student) => ({
            id: student.id,
            name: student.name,
            listedFeeHkd: listedTuitions.get(student.name) ?? null,
          }))}
        />

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-600">
                <th className="py-2 pr-3 font-medium">教練</th>
                <th className="py-2 pr-3 font-medium">學生</th>
                <th className="py-2 pr-3 font-medium">本身學費</th>
                <th className="py-2 pr-3 font-medium">分成比例</th>
                <th className="py-2 font-medium">教練薪資</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {(studentRates ?? []).map((rate) => {
                const name = studentName.get(rate.student_id) ?? "學生";
                const listed = listedTuitions.get(name);
                const ratio = derivedPayRatio(
                  Number(rate.amount_hkd),
                  rate.student_fee_hkd == null
                    ? null
                    : Number(rate.student_fee_hkd),
                  rate.pay_ratio == null ? null : Number(rate.pay_ratio),
                );
                const coachPay =
                  listed != null && ratio != null
                    ? coachPayFromFeeRatio(listed, ratio)
                    : Number(rate.amount_hkd);
                return (
                <tr key={`${rate.coach_id}-${rate.student_id}`}>
                  <td className="py-3 pr-3">
                    {coachName.get(rate.coach_id) ?? "教練"}
                  </td>
                  <td className="py-3 pr-3">{name}</td>
                  <td className="py-3 pr-3">
                    {listed != null ? formatMoney(listed) : "—"}
                  </td>
                  <td className="py-3 pr-3">
                    {ratio != null ? `${formatPayRatioPercent(ratio)}%` : "—"}
                  </td>
                  <td className="py-3">
                    {formatMoney(coachPay)}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {(studentRates ?? []).length === 0 ? (
            <p className="py-3 text-sm text-stone-500">尚未設定 PT 費率</p>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
