import {
  createCoachAction,
  deleteCoachAction,
  resetCoachPasswordAction,
  updateCoachNameAction,
} from "@/actions/coaches";
import { saveStaffWorkTypesAction } from "@/actions/lesson-types";
import { ActionForm } from "@/components/action-form";
import { EmployerSettingsBackLink } from "@/components/employer-settings-back-link";
import { Field, Panel, SelectField, SubmitButton } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CoachesPage() {
  await requireEmployer();
  const supabase = await createClient();
  const [{ data: coaches }, { data: lessonTypes }, { data: workTypes }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name, staff_kind, hourly_rate_hkd, pay_ratio, must_change_password")
        .eq("role", "coach")
        .order("full_name"),
      supabase
        .from("lesson_types")
        .select("id, name")
        .eq("active", true)
        .order("name"),
      supabase.from("staff_work_types").select("coach_id, lesson_type_id"),
    ]);

  const assignedTypes = new Set(
    (workTypes ?? []).map((row) => `${row.coach_id}:${row.lesson_type_id}`),
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
                { value: "coach", label: "Coach" },
                { value: "operations", label: "Admin" },
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
                        { value: "coach", label: "Coach" },
                        { value: "operations", label: "Admin" },
                      ]}
                    />
                  </div>
                  <div className="w-36">
                    <Field
                      label="時薪"
                      name="hourly_rate_hkd"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={
                        coach.hourly_rate_hkd == null
                          ? ""
                          : String(coach.hourly_rate_hkd)
                      }
                    />
                  </div>
                  <div className="w-36">
                    <Field
                      label="分成 %"
                      name="pay_ratio_percent"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={
                        coach.pay_ratio == null
                          ? ""
                          : String(Math.round(Number(coach.pay_ratio) * 10000) / 100)
                      }
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
                <ActionForm
                  action={saveStaffWorkTypesAction}
                  className="space-y-2 rounded-md border border-stone-200 p-3"
                >
                  <input type="hidden" name="coach_id" value={coach.id} />
                  <p className="text-sm font-medium text-stone-800">工作類型</p>
                  <p className="text-xs text-stone-500">
                    同事做完工作後，只可從這裡勾選的類型報實際工作。
                  </p>
                  {(lessonTypes ?? []).length === 0 ? (
                    <p className="text-sm text-stone-500">尚未有啟用中的工作類型</p>
                  ) : (
                    <ul className="grid gap-1">
                      {(lessonTypes ?? []).map((type) => (
                        <li key={type.id}>
                          <label className="flex items-center gap-2 text-sm text-stone-700">
                            <input
                              type="checkbox"
                              name="lesson_type_id"
                              value={type.id}
                              defaultChecked={assignedTypes.has(
                                `${coach.id}:${type.id}`,
                              )}
                              className="size-4 rounded border-stone-300"
                            />
                            {type.name}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  <SubmitButton>儲存工作類型</SubmitButton>
                </ActionForm>
              </li>
            ))}
            {(coaches ?? []).length === 0 ? (
              <li className="py-3 text-sm text-stone-500">尚未新增教練</li>
            ) : null}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
