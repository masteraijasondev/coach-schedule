import { createCoachAction } from "@/actions/coaches";
import { upsertCoachStudentRateAction } from "@/actions/rates";
import { ActionForm } from "@/components/action-form";
import { Field, Panel, SelectField, SubmitButton } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function CoachesPage() {
  await requireEmployer();
  const supabase = await createClient();
  const [{ data: coaches }, { data: students }, { data: studentRates }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "coach")
        .order("full_name"),
      supabase
        .from("students")
        .select("id, name")
        .eq("active", true)
        .order("name"),
      supabase.from("coach_student_rates").select("*"),
    ]);

  const studentName = new Map((students ?? []).map((s) => [s.id, s.name]));
  const coachName = new Map((coaches ?? []).map((c) => [c.id, c.full_name]));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="新增教練帳號">
          <ActionForm action={createCoachAction} className="space-y-3">
            <Field label="姓名" name="full_name" required />
            <Field label="電郵" name="email" type="email" required />
            <Field
              label="臨時密碼"
              name="temp_password"
              type="password"
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
              <li
                key={coach.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="font-medium">{coach.full_name}</p>
                  <p className="text-sm text-stone-500">{coach.email}</p>
                </div>
                {coach.must_change_password ? (
                  <span className="text-xs text-amber-700">待改密碼</span>
                ) : (
                  <span className="text-xs text-stone-400">已啟用</span>
                )}
              </li>
            ))}
            {(coaches ?? []).length === 0 ? (
              <li className="py-3 text-sm text-stone-500">尚未新增教練</li>
            ) : null}
          </ul>
        </Panel>
      </div>

      <Panel title="教練 PT 學生薪資（每堂固定金額）">
        <ActionForm
          action={upsertCoachStudentRateAction}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <SelectField
            label="教練"
            name="coach_id"
            required
            options={(coaches ?? []).map((c) => ({
              value: c.id,
              label: c.full_name,
            }))}
          />
          <SelectField
            label="學生"
            name="student_id"
            required
            options={(students ?? []).map((s) => ({
              value: s.id,
              label: s.name,
            }))}
          />
          <Field
            label="金額（港幣）"
            name="amount_hkd"
            type="number"
            step="0.01"
            min="0"
            required
          />
          <div className="flex items-end">
            <SubmitButton>儲存</SubmitButton>
          </div>
        </ActionForm>

        <ul className="mt-4 divide-y divide-stone-100">
          {(studentRates ?? []).map((rate) => (
            <li
              key={`${rate.coach_id}-${rate.student_id}`}
              className="py-3 text-sm"
            >
              <span className="font-medium">
                {coachName.get(rate.coach_id) ?? "教練"} ·{" "}
                {studentName.get(rate.student_id) ?? "學生"}
              </span>
              <span className="ml-2 text-stone-500">
                {formatMoney(Number(rate.amount_hkd))} / 堂
              </span>
            </li>
          ))}
          {(studentRates ?? []).length === 0 ? (
            <li className="py-3 text-sm text-stone-500">尚未設定 PT 學生薪資</li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
