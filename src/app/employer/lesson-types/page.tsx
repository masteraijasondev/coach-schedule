import {
  createLessonTypeAction,
  toggleLessonTypeActiveAction,
} from "@/actions/lesson-types";
import { ActionForm } from "@/components/action-form";
import { Field, Panel, SelectField, SubmitButton } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const PAY_MODE_LABELS: Record<string, string> = {
  per_student: "按學生（PT）",
  per_head: "按人數（MIIT）",
  per_session: "按堂",
  per_hour: "按時數（PTA/Admin）",
};

export default async function LessonTypesPage() {
  await requireEmployer();
  const supabase = await createClient();
  const { data: types } = await supabase
    .from("lesson_types")
    .select("*")
    .order("name");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="新增課堂類型">
        <ActionForm action={createLessonTypeAction} className="space-y-3">
          <Field label="名稱" name="name" required />
          <Field
            label="預設時長（分鐘）"
            name="default_duration_minutes"
            type="number"
            defaultValue="60"
            min="1"
            required
          />
          <SelectField
            label="薪資模式"
            name="pay_mode"
            required
            options={[
              { value: "per_student", label: PAY_MODE_LABELS.per_student },
              { value: "per_head", label: PAY_MODE_LABELS.per_head },
              { value: "per_session", label: PAY_MODE_LABELS.per_session },
              { value: "per_hour", label: PAY_MODE_LABELS.per_hour },
            ]}
          />
          <SubmitButton>新增</SubmitButton>
        </ActionForm>
      </Panel>

      <Panel title="課堂類型">
        <ul className="divide-y divide-stone-100">
          {(types ?? []).map((type) => (
            <li
              key={type.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium">{type.name}</p>
                <p className="text-sm text-stone-500">
                  預設 {type.default_duration_minutes} 分鐘 ·{" "}
                  {PAY_MODE_LABELS[type.pay_mode] ?? type.pay_mode}
                </p>
              </div>
              <form
                action={async () => {
                  "use server";
                  await toggleLessonTypeActiveAction(type.id, !type.active);
                }}
              >
                <button
                  type="submit"
                  className="text-sm text-stone-600 underline"
                >
                  {type.active ? "停用" : "啟用"}
                </button>
              </form>
            </li>
          ))}
          {(types ?? []).length === 0 ? (
            <li className="py-3 text-sm text-stone-500">尚未新增類型</li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
