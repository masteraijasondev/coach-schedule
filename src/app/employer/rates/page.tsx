import { upsertCoachRateAction } from "@/actions/rates";
import { ActionForm } from "@/components/action-form";
import { Field, Panel, SelectField, SubmitButton } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function RatesPage() {
  await requireEmployer();
  const supabase = await createClient();

  const [{ data: coaches }, { data: types }, { data: rates }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "coach")
        .order("full_name"),
      supabase
        .from("lesson_types")
        .select("id, name, pay_mode")
        .eq("active", true)
        .order("name"),
      supabase.from("coach_rates").select("*"),
    ]);

  const coachName = new Map((coaches ?? []).map((c) => [c.id, c.full_name]));
  const typeMeta = new Map(
    (types ?? []).map((t) => [t.id, { name: t.name, pay_mode: t.pay_mode }]),
  );

  function rateUnit(payMode: string) {
    if (payMode === "per_head") return "每人";
    return "堂";
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="設定教練薪資（MIIT 每人 / PTA·Admin 每堂）">
        <ActionForm action={upsertCoachRateAction} className="space-y-3">
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
            label="課堂類型"
            name="lesson_type_id"
            required
            options={(types ?? []).map((t) => ({
              value: t.id,
              label: t.name,
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
          <SubmitButton>儲存</SubmitButton>
        </ActionForm>
      </Panel>

      <Panel title="現有規則">
        <ul className="divide-y divide-stone-100">
          {(rates ?? []).map((rate) => {
            const meta = typeMeta.get(rate.lesson_type_id);
            return (
            <li key={`${rate.coach_id}-${rate.lesson_type_id}`} className="py-3">
              <p className="font-medium">
                {coachName.get(rate.coach_id) ?? "教練"} ·{" "}
                {meta?.name ?? "類型"}
              </p>
              <p className="text-sm text-stone-500">
                {formatMoney(Number(rate.amount_hkd))} /{" "}
                {rateUnit(meta?.pay_mode ?? "per_session")}
              </p>
            </li>
            );
          })}
          {(rates ?? []).length === 0 ? (
            <li className="py-3 text-sm text-stone-500">尚未設定薪資規則</li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
