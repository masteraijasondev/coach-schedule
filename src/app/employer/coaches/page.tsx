import { createCoachAction } from "@/actions/coaches";
import { ActionForm } from "@/components/action-form";
import { Field, Panel, SubmitButton } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CoachesPage() {
  await requireEmployer();
  const supabase = await createClient();
  const { data: coaches } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "coach")
    .order("full_name");

  return (
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
            <li key={coach.id} className="flex items-center justify-between py-3">
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
  );
}
