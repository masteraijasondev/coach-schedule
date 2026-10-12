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
import { formatPayRatioPercent } from "@/lib/pt-rate";
import { createClient } from "@/lib/supabase/server";

type LessonTypeRow = {
  id: string;
  name: string;
  pay_mode: string;
};

type CoachRateRow = {
  coach_id: string;
  lesson_type_id: string;
  amount_hkd: number | string;
};

function ChoiceBox({
  name,
  value,
  defaultChecked,
  required,
}: {
  name: string;
  value: string;
  defaultChecked?: boolean;
  required?: boolean;
}) {
  return (
    <span className="relative grid size-4 shrink-0 place-items-center">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        required={required}
        className="peer col-start-1 row-start-1 size-4 cursor-pointer appearance-none rounded-[4px] border border-stone-400 bg-white checked:border-[#2C2C2C] checked:bg-[#2C2C2C] hover:border-stone-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]"
      />
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="pointer-events-none col-start-1 row-start-1 size-3 text-white opacity-0 peer-checked:opacity-100"
      >
        <path
          d="M3.5 8.2 6.4 11.2 12.5 4.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

const choiceLabelClass =
  "inline-flex w-fit cursor-pointer items-center gap-2 rounded-md py-0.5 pr-1 text-sm font-medium text-[#2C2C2C] hover:bg-stone-50 has-checked:bg-stone-100";

function amountInputValue(value: number | string | null | undefined): string {
  if (value == null || value === "") {
    return "";
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "";
  }
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function legacyHourlyRate(
  coachId: string,
  rates: CoachRateRow[],
  types: LessonTypeRow[],
): number | null {
  const typeById = new Map(types.map((type) => [type.id, type]));
  const perHour = rates.filter((rate) => {
    if (rate.coach_id !== coachId) {
      return false;
    }
    return typeById.get(rate.lesson_type_id)?.pay_mode === "per_hour";
  });
  const adminRate = perHour.find(
    (rate) => typeById.get(rate.lesson_type_id)?.name === "Admin",
  );
  const chosen = adminRate ?? (perHour.length === 1 ? perHour[0] : null);
  if (!chosen) {
    return null;
  }
  const amount = Number(chosen.amount_hkd);
  return Number.isFinite(amount) ? amount : null;
}

export default async function CoachesPage() {
  await requireEmployer();
  const supabase = await createClient();
  const [{ data: coaches }, { data: lessonTypes }, { data: workTypes }, { data: coachRates }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name, staff_kind, hourly_rate_hkd, pay_ratio, must_change_password")
        .eq("role", "coach")
        .eq("active", true)
        .order("full_name"),
      supabase
        .from("lesson_types")
        .select("id, name, pay_mode")
        .eq("active", true)
        .order("name"),
      supabase.from("staff_work_types").select("coach_id, lesson_type_id"),
      supabase.from("coach_rates").select("coach_id, lesson_type_id, amount_hkd"),
    ]);

  const assignedTypes = new Set(
    (workTypes ?? []).map((row) => `${row.coach_id}:${row.lesson_type_id}`),
  );

  return (
    <div className="space-y-6">
      <EmployerSettingsBackLink />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        <Panel title="新增員工帳號">
          <ActionForm action={createCoachAction} className="space-y-3">
            <div data-tour="employer-coach-create-name">
              <Field label="姓名" name="full_name" required />
            </div>
            <div data-tour="employer-coach-create-role">
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
            </div>
            <div data-tour="employer-coach-create-email">
              <Field label="電郵" name="email" type="email" required />
            </div>
            <div data-tour="employer-coach-create-password">
              <Field
                label="臨時密碼"
                name="temp_password"
                type="password"
                minLength={8}
                required
              />
            </div>
            <p className="text-xs text-stone-500">
              員工首次登入必須更改密碼。
            </p>
            <div data-tour="employer-coach-create-submit">
              <SubmitButton>建立帳號</SubmitButton>
            </div>
          </ActionForm>
        </Panel>

        <Panel title="員工列表">
          <ul className="space-y-3">
            {(coaches ?? []).map((coach, coachIndex) => {
              const hourlyValue =
                coach.hourly_rate_hkd == null
                  ? amountInputValue(
                      legacyHourlyRate(
                        coach.id,
                        coachRates ?? [],
                        lessonTypes ?? [],
                      ),
                    )
                  : amountInputValue(coach.hourly_rate_hkd);
              const ratioValue =
                coach.pay_ratio == null
                  ? ""
                  : formatPayRatioPercent(Number(coach.pay_ratio));
              const tour = coachIndex === 0;
              return (
              <li key={coach.id} className="space-y-2 rounded-lg border border-stone-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg">員工姓名：{coach.full_name}</p>
                  <p className="text-lg">員工電郵：{coach.email}</p>
                  {coach.must_change_password ? (
                    <span className="shrink-0 text-xs rounded-md px-2 py-1 bg-amber-100 text-amber-700">
                      待更改密碼
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs rounded-md px-2 py-1 bg-green-100 text-green-700">
                      已啟用
                    </span>
                  )}
                </div>
                <ActionForm
                  key={`${coach.id}:${coach.staff_kind}:${hourlyValue}:${ratioValue}`}
                  action={updateCoachNameAction}
                  className="flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="coach_id" value={coach.id} />
                  <div
                    className="w-1/4"
                    data-tour={tour ? "employer-coach-edit-name" : undefined}
                  >
                    <Field
                      label="姓名"
                      name="full_name"
                      defaultValue={coach.full_name}
                      required
                    />
                  </div>
                  <div
                    className="w-44"
                    data-tour={tour ? "employer-coach-edit-role" : undefined}
                  >
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
                  <div
                    className="w-36"
                    data-tour={tour ? "employer-coach-hourly" : undefined}
                  >
                    <Field
                      label="時薪"
                      name="hourly_rate_hkd"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={hourlyValue}
                    />
                  </div>
                  {coach.staff_kind === "operations" ? null : (
                    <div
                      className="w-36"
                      data-tour={tour ? "employer-coach-ratio" : undefined}
                    >
                      <Field
                        label="分成 %"
                        name="pay_ratio_percent"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={ratioValue}
                      />
                    </div>
                  )}
                  <div data-tour={tour ? "employer-coach-save-profile" : undefined}>
                    <SubmitButton>更新員工資料</SubmitButton>
                  </div>
                </ActionForm>
                
                <ActionForm
                  action={saveStaffWorkTypesAction}
                  className="space-y-2 rounded-md border border-stone-200 p-3"
                >
                  <input type="hidden" name="coach_id" value={coach.id} />
                  <p className="text-sm font-medium text-stone-800">工作類型</p>
                  {(lessonTypes ?? []).length === 0 ? (
                    <p className="text-sm text-stone-500">
                      尚未有啟用中的工作類型。請先到「課堂類型」新增。
                    </p>
                  ) : (
                    <ul
                      className="flex flex-wrap gap-1"
                      data-tour={tour ? "employer-coach-types" : undefined}
                    >
                      {(lessonTypes ?? []).map((type) => {
                        const rateValue = amountInputValue(
                          (coachRates ?? []).find(
                            (rate) =>
                              rate.coach_id === coach.id &&
                              rate.lesson_type_id === type.id,
                          )?.amount_hkd,
                        );
                        return (
                        <li
                          key={type.id}
                          className={
                            type.pay_mode === "per_hour"
                              ? "inline-flex w-fit items-center gap-1.5 px-1.5 py-0.5"
                              : "inline-flex w-fit items-center"
                          }
                        >
                          <label className={choiceLabelClass}>
                            <ChoiceBox
                              name="lesson_type_id"
                              value={type.id}
                              defaultChecked={assignedTypes.has(
                                `${coach.id}:${type.id}`,
                              )}
                            />
                            {type.name}
                          </label>
                          {type.pay_mode === "per_hour" ? (
                            <input
                              name={`hourly_rate_${type.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              defaultValue={rateValue}
                              placeholder="時薪"
                              aria-label={`${type.name} 時薪`}
                              data-tour={
                                tour ? "employer-coach-type-rate" : undefined
                              }
                              className="h-7 w-20 rounded-md border border-stone-300 bg-white px-2 text-sm text-stone-900 outline-none focus:border-stone-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]"
                            />
                          ) : null}
                        </li>
                        );
                      })}
                    </ul>
                  )}
                  <div data-tour={tour ? "employer-coach-save-types" : undefined}>
                    <SubmitButton>儲存工作類型</SubmitButton>
                  </div>
                </ActionForm>
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
                      <SubmitButton variant="secondary">重設密碼</SubmitButton>
                    </ActionForm>
                    <ActionForm
                      action={deleteCoachAction}
                      className="space-y-3"
                    >
                      <input type="hidden" name="coach_id" value={coach.id} />
                      <label className={choiceLabelClass}>
                        <ChoiceBox name="confirm_delete" value="1" required />
                        確認刪除此帳號
                      </label>
                      <p className="text-xs text-stone-500">
                        刪除後不能再登入，並會從員工名單移除。已有課堂紀錄會保留在已刪除的帳號。用同一電郵重新建立時，會是新帳號，不會帶入舊紀錄。
                      </p>
                      <SubmitButton variant="danger">刪除帳號</SubmitButton>
                    </ActionForm>
                  </div>
                </details>
              </li>
              );
            })}
            {(coaches ?? []).length === 0 ? (
              <li className="py-3 text-sm text-stone-500">尚未新增員工</li>
            ) : null}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
